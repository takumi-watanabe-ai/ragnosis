/**
 * Repository for GitHub repos data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { BaseRankingRepository, type RankingFilters } from './base-ranking-repository.ts'

export interface ReposFilters {
  owner?: string  // Single owner filter
}

export class ReposRepository extends BaseRankingRepository {
  constructor(supabase: ReturnType<typeof createClient>) {
    super(supabase)
  }

  /**
   * Get top repos by stars with optional owner filter
   */
  async getTopByStars(
    query: string,
    limit: number,
    filters?: ReposFilters
  ): Promise<SearchResult[]> {
    return this.getTop(query, limit, {
      filterValue: filters?.owner
    })
  }

  protected getRpcName(): string {
    return 'get_top_repos'
  }

  protected getFilterParamName(): string {
    return 'filter_owner'
  }

  protected getLogMessage(): string {
    return 'Top repos by stars with reranking'
  }

  protected mapToSearchResult(r: any): SearchResult {
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
