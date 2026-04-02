/**
 * Repository for HuggingFace models data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { CrossEncoderReranker } from '../reranker.ts'
import { config } from '../config.ts'

interface ModelsFilters {
  categories?: string[]
  authors?: string[]
}

export class ModelsRepository {
  private reranker: CrossEncoderReranker

  constructor(private supabase: ReturnType<typeof createClient>) {
    this.reranker = new CrossEncoderReranker()
  }

  /**
   * Get top models by downloads with optional filters and reranking
   */
  async getTopByDownloads(
    query: string,
    limit: number,
    filters?: ModelsFilters
  ): Promise<SearchResult[]> {
    console.log(`📊 Top models by downloads with reranking`)

    // Try with filters if provided
    const category = filters?.categories?.[0] || null
    const author = filters?.authors?.[0] || null

    // Fetch more candidates for reranking
    const candidateCount = config.ranking.candidateCount
    const candidates = await this.query(candidateCount, category, author)

    // Fallback if filtered query returned nothing
    if (candidates.length === 0 && (category || author)) {
      console.log(`⚠️  No results with filters, falling back to unfiltered query`)
      const unfilteredCandidates = await this.query(candidateCount, null, null)
      return await this.reranker.rerank(query, unfilteredCandidates, config.ranking.finalResultCount)
    }

    // For ranking queries, SQL order (by downloads) is already correct
    // No need to rerank - just return top N
    return candidates.slice(0, config.ranking.finalResultCount)
  }

  /**
   * Query top models using get_top_models RPC function
   */
  private async query(limit: number, category: string | null, author: string | null): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('get_top_models', {
      match_limit: limit,
      filter_category: category,
      filter_author: author
    })

    if (error) {
      console.error('❌ Top models query failed:', error)
      return []
    }

    return (data || []).map((m: any) => this.mapToSearchResult(m))
  }

  /**
   * Map database record to SearchResult
   */
  private mapToSearchResult(m: any): SearchResult {
    return {
      id: m.id,
      name: m.name,
      description: m.description || '',
      url: m.url,
      doc_type: 'hf_model' as const,
      similarity: 1.0,
      rerank_score: 1.0,
      downloads: m.downloads,
      likes: m.likes,
      ranking_position: m.ranking_position,
      author: m.author,
      task: m.task,
      rag_category: m.rag_category
    }
  }
}
