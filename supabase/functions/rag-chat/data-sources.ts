/**
 * Unified data source interface
 * Thin coordinator that routes to appropriate repositories
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { DataSourceQuery, SearchResult } from './types.ts'
import { config } from './config.ts'
import { HybridSearch } from './search/hybrid-search.ts'
import { ModelsRepository } from './sources/models-repository.ts'
import { ReposRepository } from './sources/repos-repository.ts'
import { TrendsRepository } from './sources/trends-repository.ts'

const supabase = createClient(
  config.database.url,
  config.database.serviceRoleKey
)

// Lazy-initialized hybrid search instance
let hybridSearch: HybridSearch | null = null

/**
 * Get or create hybrid search instance
 */
function getHybridSearch(): HybridSearch {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch(
      supabase,
      {
        candidateCount: config.search.candidateCount,
        finalResultCount: config.search.finalResultCount,
        descriptionMax: config.search.context.descriptionMax,
        structuredDataBoost: config.search.structuredDataBoost
      },
      config.embedding.model
    )
  }
  return hybridSearch
}

/**
 * Execute a single data source query
 */
export async function executeDataSource(
  query: DataSourceQuery
): Promise<SearchResult[]> {
  const limit = query.params?.limit || 5

  switch (query.source) {
    case 'top_models_by_downloads':
      return await new ModelsRepository(supabase).getTopByDownloads(limit, {
        categories: query.params?.categories,
        authors: query.params?.authors
      })

    case 'top_repos_by_stars':
      return await new ReposRepository(supabase).getTopByStars(limit, {
        categories: query.params?.categories,
        owners: query.params?.owners
      })

    case 'search_trends':
      return await new TrendsRepository(supabase).getTopTrends(limit)

    case 'vector_search_unified':
      return await getHybridSearch().search(
        query.params?.query || '',
        limit
      )

    default:
      console.error(`Unknown data source: ${query.source}`)
      return []
  }
}
