/**
 * Hybrid search - combines vector (k-NN) + full-text (BM25) search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { CrossEncoderReranker } from '../reranker.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

interface SearchConfig {
  candidateCount: number
  finalResultCount: number
  descriptionMax: number
  structuredDataBoost: number
}

export interface SearchFilters {
  tags?: string[]
  doc_type?: 'hf_model' | 'github_repo' | 'blog_article'
  category?: string
  author?: string
  owner?: string
}

export class HybridSearch {
  private aiSession: any = null
  private reranker: CrossEncoderReranker

  constructor(
    private supabase: ReturnType<typeof createClient>,
    private config: SearchConfig,
    private embeddingModel: string
  ) {
    this.reranker = new CrossEncoderReranker()
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
    if (filters?.tags?.length) {
      console.log(`🏷️  Filtering by tags:`, filters.tags)
    }

    // Run both searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      this.performVectorSearch(query, filters),
      this.performTextSearch(query, filters)
    ])

    console.log(`📊 Vector search: ${vectorResults.length} results`)
    console.log(`📊 Text search: ${textResults.length} results`)

    // Merge with Reciprocal Rank Fusion (RRF)
    // const merged = this.mergeWithRRF(vectorResults, textResults, this.config.candidateCount * 2)
    const merged = this.mergeWithRRF(vectorResults, textResults, this.config.candidateCount * 2)
    console.log(`📊 Merged: ${merged.length} unique results`)

    // Rerank merged results using semantic similarity
    const reranked = await this.reranker.rerank(query, merged, this.config.finalResultCount)
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

    // Vector search with tag filtering
    const rpcParams = {
      query_embedding: embedding,
      match_count: this.config.candidateCount,
      filter_doc_type: filters?.doc_type || null,
      // Don't use tag filtering for blog articles - they have conceptual tags, semantic search is better
      filter_tags: filters?.doc_type === 'blog_article' ? null : (filters?.tags || null)
    }
    console.log('🔍 Vector search RPC params (tags only):', { filter_tags: rpcParams.filter_tags })

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
      // Don't use tag filtering for blog articles - they have conceptual tags, semantic search is better
      filter_tags: filters?.doc_type === 'blog_article' ? null : (filters?.tags || null)
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
   * Weights: 70% vector (semantic), 30% BM25 (keyword) - optimized for balanced retrieval
   * RRF formula: score(d) = sum(weight * 1 / (k + rank(d))) for each ranking
   */
  private mergeWithRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const k = 60  // RRF constant (typical value)
    const vectorWeight = 0.7  // 70% weight for semantic search
    const keywordWeight = 0.3  // 30% weight for keyword search
    const scores = new Map<string, { result: SearchResult; score: number }>()

    // Add vector search scores (70% weight)
    vectorResults.forEach((result, index) => {
      const rank = index + 1
      const score = vectorWeight * (1 / (k + rank))
      scores.set(result.id, { result, score })
    })

    // Add text search scores (30% weight)
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

    // Apply boost to models/repos (compensate for shorter content vs long blog articles)
    // BM25 heavily penalizes short documents - need significant boost to compete
    scores.forEach((value) => {
      const docType = value.result.doc_type
      if (docType === 'hf_model' || docType === 'github_repo') {
        value.score *= this.config.structuredDataBoost
      }
    })

    // Sort by RRF score and deduplicate by URL
    const sorted = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ result, score }) => ({
        ...result,
        rerank_score: score,
        similarity: score
      }))

    // Deduplicate by URL (keep highest score)
    const urlMap = new Map<string, SearchResult>()
    sorted.forEach(r => {
      if (!urlMap.has(r.url) || (r.rerank_score || 0) > (urlMap.get(r.url)!.rerank_score || 0)) {
        urlMap.set(r.url, r)
      }
    })

    return Array.from(urlMap.values()).slice(0, limit)
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
      content: d.text,
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
