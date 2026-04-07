/**
 * Repository for HuggingFace models data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { BaseRankingRepository, type RankingFilters } from './base-ranking-repository.ts'

export interface ModelsFilters {
  author?: string  // Single author filter
  task?: string    // Task filter (e.g., "embedding", "text-generation")
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
    console.log(`📊 Top models by downloads${filters?.task ? ` (task: ${filters.task})` : ''}`)

    const filterValue = filters?.author || null
    const taskFilter = filters?.task || null

    // Fetch more candidates for filtering
    const candidateCount = 200 // Get more candidates to filter by task (increased for better filtering results)

    // Call RPC to get top models
    const { data, error } = await this.supabase.rpc('get_top_models', {
      match_limit: candidateCount,
      filter_author: filterValue
    })

    if (error) {
      console.error(`❌ get_top_models query failed:`, error)
      return []
    }

    let results = (data || []).map((item: any) => this.mapToSearchResult(item))

    // Client-side task filtering if task filter provided
    if (taskFilter && results.length > 0) {
      const taskLower = taskFilter.toLowerCase()
      const beforeCount = results.length
      
      results = results.filter(r => {
        // Match against task field (exact or partial match)
        if (r.task) {
          const taskFieldLower = r.task.toLowerCase()
          if (taskFieldLower.includes(taskLower)) return true
        }
        
        // Fallback: match against name or description
        const nameLower = r.name.toLowerCase()
        const descLower = (r.description || '').toLowerCase()
        return nameLower.includes(taskLower) || descLower.includes(taskLower)
      })
      
      console.log(`🔍 Task filter "${taskFilter}": ${beforeCount} → ${results.length} models`)
      
      // If filtered results are empty, fall back to unfiltered
      if (results.length === 0) {
        console.log(`⚠️  No models match task "${taskFilter}", returning top models without filter`)
        results = (data || []).map((item: any) => this.mapToSearchResult(item))
      }
    }

    return results.slice(0, limit)
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
