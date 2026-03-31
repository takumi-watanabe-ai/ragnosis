/**
 * Repository for HuggingFace models data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'

interface ModelsFilters {
  categories?: string[]
  authors?: string[]
}

export class ModelsRepository {
  constructor(private supabase: ReturnType<typeof createClient>) {}

  /**
   * Get top models by downloads with optional filters
   */
  async getTopByDownloads(limit: number, filters?: ModelsFilters): Promise<SearchResult[]> {
    console.log(`📊 Top models by downloads`)

    // Try with filters if provided
    const category = filters?.categories?.[0] || null
    const author = filters?.authors?.[0] || null
    const results = await this.query(limit, category, author)

    // Fallback if filtered query returned nothing
    if (results.length === 0 && (category || author)) {
      console.log(`⚠️  No results with filters, falling back to unfiltered query`)
      return await this.query(limit, null, null)
    }

    return results
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
