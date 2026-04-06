/**
 * Hybrid search - combines vector (k-NN) + full-text (BM25) search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { createReranker } from '../reranker.ts'
import { config } from '../config.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

interface SearchConfig {
  candidateCount: number
  finalResultCount: number
  descriptionMax: number
}

export interface SearchFilters {
  doc_type?: 'hf_model' | 'github_repo' | 'knowledge_base'
  category?: string
  author?: string
  owner?: string
  nouns?: string[]  // Key nouns for BM25 filtering
  doc_type_weights?: {
    knowledge_base: number
    hf_model: number
    github_repo: number
  }
}

export class HybridSearch {
  private aiSession: any = null
  private reranker: ReturnType<typeof createReranker>

  constructor(
    private supabase: ReturnType<typeof createClient>,
    private config: SearchConfig,
    private embeddingModel: string
  ) {
    this.reranker = createReranker(embeddingModel)
  }

  /**
   * Perform hybrid search combining vector and text search
   */
  async search(
    query: string,
    limit: number,
    filters?: SearchFilters
  ): Promise<SearchResult[]> {
    console.log(`🔍 Hybrid search (k-NN + BM25): "${query}"`)
    if (filters?.nouns?.length) {
      console.log(`🎯 BM25 noun filtering enabled:`, filters.nouns)
    }

    // Run both searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      this.performVectorSearch(query, filters),
      this.performTextSearch(query, filters)
    ])

    console.log(`📊 Vector search: ${vectorResults.length} results`)
    console.log(`📊 Text search: ${textResults.length} results`)

    // Merge with Reciprocal Rank Fusion (RRF)
    const merged = this.mergeWithRRF(vectorResults, textResults, this.config.candidateCount * 2, filters)
    console.log(`📊 Merged: ${merged.length} unique results`)

    // Rerank merged results (checks feature flag for cross-encoder)
    const reranked = await this.reranker.rerank(query, merged, this.config.finalResultCount, this.supabase)
    console.log(`✅ Hybrid search complete: ${reranked.length} results after reranking`)

    return reranked
  }

  /**
   * Vector search using k-NN
   */
  private async performVectorSearch(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    // Generate embedding
    let embedding: number[]
    try {
      if (!this.aiSession) {
        console.log(`🤖 Initializing AI session with model: ${this.embeddingModel}`)
        // @ts-ignore
        this.aiSession = new Supabase.ai.Session(this.embeddingModel)
      }

      embedding = await this.aiSession.run(query, { mean_pool: true, normalize: true })
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      return []
    }

    // Vector search params
    const rpcParams = {
      query_embedding: embedding,
      match_count: this.config.candidateCount,
      filter_doc_type: filters?.doc_type || null
    }

    const { data, error } = await this.supabase.rpc('match_documents', rpcParams)

    if (error) {
      console.error('❌ Vector search failed:', error)
      return []
    }

    const results = (data || []).map((d: any) => {
      const result = this.mapToSearchResult(d, d.similarity || 0)
      result.vector_similarity = d.similarity || 0  // Preserve original vector similarity
      return result
    })

    // Tag filtering now done in SQL for better performance
    return results
  }

  /**
   * Full-text search using BM25
   */
  private async performTextSearch(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const rpcParams = {
      search_query: query,
      match_limit: this.config.candidateCount,
      filter_doc_type: filters?.doc_type || null,
      filter_nouns: filters?.nouns || null
    }
    console.log('🔍 Text search RPC params:', JSON.stringify(rpcParams, null, 2))

    const { data, error } = await this.supabase.rpc('text_search_documents', rpcParams)

    if (error) {
      console.error('❌ Text search failed:', error)
      return []
    }

    if (!data || !data.success) {
      console.error('❌ Text search returned error:', data?.error)
      return []
    }

    const results = (data.data?.results || []).map((d: any) => {
      const result = this.mapToSearchResult(d, d.rank || 0)
      result.bm25_rank = d.rank || 0  // Preserve original BM25 rank
      return result
    })

    // Tag filtering now done in SQL for better performance
    return results
  }

  /**
   * Merge results using weighted Reciprocal Rank Fusion (RRF)
   * RRF formula: score(d) = sum(weight * 1 / (k + rank(d))) for each ranking
   * Weights from config: 60% vector (semantic), 40% BM25 (keyword)
   * Then applies doc_type_weights if provided by LLM planner
   * Note: BM25 results are pre-filtered by nouns at the query level
   */
  private mergeWithRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    limit: number,
    filters?: SearchFilters
  ): SearchResult[] {
    const k = 60  // RRF constant (typical value)
    const vectorWeight = config.search.reranker.fusion.vectorWeight
    const keywordWeight = config.search.reranker.fusion.bm25Weight
    const scores = new Map<string, { result: SearchResult; score: number }>()

    // Add vector search scores (weighted by config)
    vectorResults.forEach((result, index) => {
      const rank = index + 1
      const score = vectorWeight * (1 / (k + rank))
      scores.set(result.id, { result, score })
    })

    // Add BM25 text search scores (weighted by config)
    textResults.forEach((result, index) => {
      const rank = index + 1
      const score = keywordWeight * (1 / (k + rank))

      if (scores.has(result.id)) {
        // Document appears in both - add weighted scores
        scores.get(result.id)!.score += score
      } else {
        scores.set(result.id, { result, score })
      }
    })

    // Apply LLM-based doc_type weights if provided
    if (filters?.doc_type_weights) {
      console.log('🎯 Applying LLM doc_type weights:', filters.doc_type_weights)
      scores.forEach((value) => {
        const docType = value.result.doc_type
        const weight = filters.doc_type_weights![docType] || 0.5
        value.score *= weight
      })
    }

    // Sort by RRF score
    const sorted = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ result, score }) => ({
        ...result,
        rerank_score: score,
        similarity: score
      }))

    // Keep top N chunks per URL (for chunked documents)
    const maxChunks = config.search.maxChunksPerUrl
    console.log(`🔗 Keeping up to ${maxChunks} chunks per URL`)

    const urlMap = new Map<string, SearchResult[]>()
    sorted.forEach(r => {
      if (!urlMap.has(r.url)) {
        urlMap.set(r.url, [])
      }
      const chunks = urlMap.get(r.url)!
      if (chunks.length < maxChunks) {
        chunks.push(r)
      }
    })

    // Flatten back to array, maintaining sort order
    const deduplicated = Array.from(urlMap.values()).flat()

    return deduplicated.slice(0, limit)
  }

  /**
   * Map database result to SearchResult
   */
  private mapToSearchResult(d: any, score: number): SearchResult {
    return {
      id: d.id,
      name: d.name || '',
      description: d.description || d.text?.substring(0, this.config.descriptionMax) || '',
      url: d.url,
      doc_type: d.doc_type,
      similarity: score,
      rerank_score: score,
      topics: d.topics || [],  // Include topics for tag matching
      downloads: d.downloads,
      stars: d.stars,
      likes: d.likes,
      forks: d.forks,
      ranking_position: d.ranking_position,
      author: d.author,
      owner: d.owner,
      language: d.language,
      task: d.task,
      published_at: d.published_at,
      content_source: d.content_source,
      snapshot_date: d.snapshot_date
    }
  }
}
