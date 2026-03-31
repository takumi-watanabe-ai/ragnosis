/**
 * Repository for GitHub repos data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'

interface ReposFilters {
  categories?: string[]
  owners?: string[]
}

export class ReposRepository {
  constructor(private supabase: ReturnType<typeof createClient>) {}

  /**
   * Get top repos by stars with optional filters
   */
  async getTopByStars(limit: number, filters?: ReposFilters): Promise<SearchResult[]> {
    console.log(`📊 Top repos by stars`)

    // Try with filters if provided
    const category = filters?.categories?.[0] || null
    const owner = filters?.owners?.[0] || null
    const results = await this.query(limit, category, owner)

    // Fallback if filtered query returned nothing
    if (results.length === 0 && (category || owner)) {
      console.log(`⚠️  No repos with filters, falling back to unfiltered`)
      return await this.query(limit, null, null)
    }

    return results
  }

  /**
   * Query top repos using get_top_repos RPC function
   */
  private async query(limit: number, category: string | null, owner: string | null): Promise<SearchResult[]> {
    const { data, error } = await this.supabase.rpc('get_top_repos', {
      match_limit: limit,
      filter_category: category,
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
      language: r.language,
      rag_category: r.rag_category
    }
  }
}
