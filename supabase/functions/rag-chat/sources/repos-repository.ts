/**
 * Repository for GitHub repos data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { CrossEncoderReranker } from '../reranker.ts'
import { config } from '../config.ts'

interface ReposFilters {
  categories?: string[]
  owners?: string[]
}

export class ReposRepository {
  private reranker: CrossEncoderReranker

  constructor(private supabase: ReturnType<typeof createClient>) {
    this.reranker = new CrossEncoderReranker()
  }

  /**
   * Get top repos by stars with optional filters and reranking
   */
  async getTopByStars(
    query: string,
    limit: number,
    filters?: ReposFilters
  ): Promise<SearchResult[]> {
    console.log(`📊 Top repos by stars with reranking`)

    // Try with filters if provided
    const category = filters?.categories?.[0] || null
    const owner = filters?.owners?.[0] || null

    // Fetch more candidates for reranking
    const candidateCount = config.ranking.candidateCount
    const candidates = await this.query(candidateCount, owner)

    // Fallback if filtered query returned nothing
    if (candidates.length === 0 && (category || owner)) {
      console.log(`⚠️  No repos with filters, falling back to unfiltered`)
      const unfilteredCandidates = await this.query(candidateCount, null)
      return await this.reranker.rerank(query, unfilteredCandidates, config.ranking.finalResultCount)
    }

    // For ranking queries, SQL order (by stars) is already correct
    // No need to rerank - just return top N
    return candidates.slice(0, config.ranking.finalResultCount)
  }

  /**
   * Query top repos using get_top_repos RPC function
   */
  private async query(limit: number, owner: string | null): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('get_top_repos', {
      match_limit: limit,
      filter_owner: owner
    })

    if (error) {
      console.error('❌ Top repos query failed:', JSON.stringify(error, null, 2))
      return []
    }

    return (data || []).map((r: any) => this.mapToSearchResult(r))
  }

  /**
   * Map database record to SearchResult
   */
  private mapToSearchResult(r: any): SearchResult {
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      url: r.url,
      doc_type: 'github_repo' as const,
      similarity: 1.0,
      rerank_score: 1.0,
      stars: r.stars,
      forks: r.forks,
      owner: r.owner,
      language: r.language
    }
  }
}
