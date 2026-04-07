/**
 * Repository for GitHub repos data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { BaseRankingRepository, type RankingFilters } from './base-ranking-repository.ts'

export interface ReposFilters {
  owner?: string   // Single owner filter
  topic?: string   // Topic filter (e.g., "vector-database", "embeddings")
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
    console.log(`📊 Top repos by stars${filters?.topic ? ` (topic: ${filters.topic})` : ''}`)

    const filterValue = filters?.owner || null
    const topicFilter = filters?.topic || null

    // Fetch more candidates for filtering
    const candidateCount = 200 // Get more candidates to filter by topic (increased for better filtering results)

    // Call RPC to get top repos
    const { data, error } = await this.supabase.rpc('get_top_repos', {
      match_limit: candidateCount,
      filter_owner: filterValue
    })

    if (error) {
      console.error(`❌ get_top_repos query failed:`, error)
      return []
    }

    let results = (data || []).map((item: any) => this.mapToSearchResult(item))

    // Client-side topic filtering if topic filter provided
    if (topicFilter && results.length > 0) {
      const topicLower = topicFilter.toLowerCase()
      const beforeCount = results.length
      
      results = results.filter(r => {
        // Match against name, description, or language
        const nameLower = r.name.toLowerCase()
        const descLower = (r.description || '').toLowerCase()
        const langLower = (r.language || '').toLowerCase()
        
        return nameLower.includes(topicLower) || 
               descLower.includes(topicLower) || 
               langLower.includes(topicLower)
      })
      
      console.log(`🔍 Topic filter "${topicFilter}": ${beforeCount} → ${results.length} repos`)
      
      // If filtered results are empty, fall back to unfiltered
      if (results.length === 0) {
        console.log(`⚠️  No repos match topic "${topicFilter}", returning top repos without filter`)
        results = (data || []).map((item: any) => this.mapToSearchResult(item))
      }
    }

    return results.slice(0, limit)
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
