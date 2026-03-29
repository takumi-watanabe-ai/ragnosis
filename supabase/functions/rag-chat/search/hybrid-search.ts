/**
 * Hybrid search - combines vector (k-NN) + full-text (BM25) search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

interface SearchConfig {
  candidateCount: number
  finalResultCount: number
  descriptionMax: number
  structuredDataBoost: number
}

export class HybridSearch {
  private aiSession: any = null

  constructor(
    private supabase: ReturnType<typeof createClient>,
    private config: SearchConfig,
    private embeddingModel: string
  ) {}

  /**
   * Perform hybrid search combining vector and text search
   */
  async search(
    query: string,
    limit: number
  ): Promise<SearchResult[]> {
    console.log(`🔍 Hybrid search (k-NN + BM25): "${query}"`)

    // Run both searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      this.performVectorSearch(query),
      this.performTextSearch(query)
    ])

    console.log(`📊 Vector search: ${vectorResults.length} results`)
    console.log(`📊 Text search: ${textResults.length} results`)

    // Merge with Reciprocal Rank Fusion (RRF)
    const merged = this.mergeWithRRF(vectorResults, textResults, this.config.candidateCount * 2)
    console.log(`📊 Merged: ${merged.length} unique results`)

    // Return top N results by RRF score
    const final = merged.slice(0, this.config.finalResultCount)
    console.log(`✅ Hybrid search complete: ${final.length} results`)

    return final
  }

  /**
   * Vector search using k-NN
   */
  private async performVectorSearch(query: string): Promise<SearchResult[]> {
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

    // Vector search
    const { data, error } = await this.supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_count: this.config.candidateCount,
      filter_doc_type: null,
      filter_rag_category: null
    })

    if (error) {
      console.error('❌ Vector search failed:', error)
      return []
    }

    return (data || []).map((d: any) => this.mapToSearchResult(d, d.similarity || 0))
  }

  /**
   * Full-text search using BM25
   */
  private async performTextSearch(query: string): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('text_search_documents', {
      search_query: query,
      match_limit: this.config.candidateCount,
      filter_doc_type: null,
      filter_rag_category: null
    })

    if (error) {
      console.error('❌ Text search failed:', error)
      return []
    }

    if (!data || !data.success) {
      console.error('❌ Text search returned error:', data?.error)
      return []
    }

    return (data.data?.results || []).map((d: any) => this.mapToSearchResult(d, d.rank || 0))
  }

  /**
   * Merge results using Reciprocal Rank Fusion (RRF)
   * RRF formula: score(d) = sum(1 / (k + rank(d))) for each ranking
   */
  private mergeWithRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    limit: number
  ): SearchResult[] {
    const k = 60  // RRF constant (typical value)
    const scores = new Map<string, { result: SearchResult; score: number }>()

    // Add vector search scores
    vectorResults.forEach((result, index) => {
      const rank = index + 1
      const score = 1 / (k + rank)
      scores.set(result.id, { result, score })
    })

    // Add text search scores
    textResults.forEach((result, index) => {
      const rank = index + 1
      const score = 1 / (k + rank)

      if (scores.has(result.id)) {
        // Document appears in both - add scores
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
      rag_category: d.rag_category,
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
