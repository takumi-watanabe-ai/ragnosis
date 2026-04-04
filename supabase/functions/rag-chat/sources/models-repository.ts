/**
 * Repository for HuggingFace models data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { BaseRankingRepository, type RankingFilters } from './base-ranking-repository.ts'

export interface ModelsFilters {
  author?: string  // Single author filter
}

export class ModelsRepository extends BaseRankingRepository {
  constructor(supabase: ReturnType<typeof createClient>) {
    super(supabase)
  }

  /**
   * Get top models by downloads with optional author filter
   */
  async getTopByDownloads(
    query: string,
    limit: number,
    filters?: ModelsFilters
  ): Promise<SearchResult[]> {
    return this.getTop(query, limit, {
      filterValue: filters?.author
    })
  }

  protected getRpcName(): string {
    return 'get_top_models'
  }

  protected getFilterParamName(): string {
    return 'filter_author'
  }

  protected getLogMessage(): string {
    return 'Top models by downloads with reranking'
  }

  protected mapToSearchResult(m: any): SearchResult {
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
      task: m.task
    }
  }
}
