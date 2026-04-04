/**
 * Base repository for ranked data sources (models, repos)
 * Eliminates duplication between similar repository classes
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { CrossEncoderReranker } from '../reranker.ts'
import { config } from '../config.ts'

export interface RankingFilters {
  filterValue?: string  // Single filter (author/owner/etc)
}

export abstract class BaseRankingRepository {
  protected reranker: CrossEncoderReranker

  constructor(protected supabase: ReturnType<typeof createClient>) {
    this.reranker = new CrossEncoderReranker()
  }

  /**
   * Get top items with optional filters and reranking
   */
  async getTop(
    query: string,
    limit: number,
    filters?: RankingFilters
  ): Promise<SearchResult[]> {
    console.log(`📊 ${this.getLogMessage()}`)

    const filterValue = filters?.filterValue || null

    // Fetch more candidates for reranking
    const candidateCount = config.ranking.candidateCount
    const candidates = await this.query(candidateCount, filterValue)

    // Fallback if filtered query returned nothing
    if (candidates.length === 0 && filterValue) {
      console.log(`⚠️  No results with filter, falling back to unfiltered query`)
      const unfilteredCandidates = await this.query(candidateCount, null)
      return await this.reranker.rerank(query, unfilteredCandidates, config.ranking.finalResultCount)
    }

    // For ranking queries, SQL order is already correct
    // No need to rerank - just return top N
    return candidates.slice(0, config.ranking.finalResultCount)
  }

  /**
   * Query top items using RPC function
   */
  private async query(limit: number, filterValue: string | null): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc(this.getRpcName(), {
      match_limit: limit,
      [this.getFilterParamName()]: filterValue
    })

    if (error) {
      console.error(`❌ ${this.getRpcName()} query failed:`, error)
      return []
    }

    return (data || []).map((item: any) => this.mapToSearchResult(item))
  }

  /**
   * Subclasses must provide the RPC function name
   */
  protected abstract getRpcName(): string

  /**
   * Subclasses must provide the filter parameter name
   */
  protected abstract getFilterParamName(): string

  /**
   * Subclasses must provide log message
   */
  protected abstract getLogMessage(): string

  /**
   * Subclasses must implement mapping logic
   */
  protected abstract mapToSearchResult(data: any): SearchResult
}
