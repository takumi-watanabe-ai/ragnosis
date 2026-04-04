/**
 * Unified data source interface
 * Thin coordinator that routes to appropriate repositories
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { DataSourceQuery, SearchResult } from './types.ts'
import { config } from './config.ts'
import { HybridSearch } from './search/hybrid-search.ts'
import { ModelsRepository } from './sources/models-repository.ts'
import { ReposRepository } from './sources/repos-repository.ts'
import { TrendsRepository } from './sources/trends-repository.ts'
import { expandQuery } from './query-expander.ts'
import { getFeatureFlagService } from './services/feature-flags.ts'
import { LOG_PREFIX } from './utils/constants.ts'

// Lazy-initialized instances (per supabase client)
let hybridSearch: HybridSearch | null = null
let modelsRepository: ModelsRepository | null = null
let reposRepository: ReposRepository | null = null
let trendsRepository: TrendsRepository | null = null

/**
 * Get or create hybrid search instance
 */
function getHybridSearch(supabase: SupabaseClient): HybridSearch {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch(
      supabase,
      {
        candidateCount: config.search.candidateCount,
        finalResultCount: config.search.finalResultCount,
        descriptionMax: config.search.context.descriptionMax
      },
      config.embedding.model
    )
  }
  return hybridSearch
}

/**
 * Get or create models repository instance
 */
function getModelsRepository(supabase: SupabaseClient): ModelsRepository {
  if (!modelsRepository) {
    modelsRepository = new ModelsRepository(supabase)
  }
  return modelsRepository
}

/**
 * Get or create repos repository instance
 */
function getReposRepository(supabase: SupabaseClient): ReposRepository {
  if (!reposRepository) {
    reposRepository = new ReposRepository(supabase)
  }
  return reposRepository
}

/**
 * Get or create trends repository instance
 */
function getTrendsRepository(supabase: SupabaseClient): TrendsRepository {
  if (!trendsRepository) {
    trendsRepository = new TrendsRepository(supabase)
  }
  return trendsRepository
}

/**
 * Execute a single data source query
 */
export async function executeDataSource(
  query: DataSourceQuery,
  supabase: SupabaseClient
): Promise<SearchResult[]> {
  const limit = query.params?.limit || 5

  switch (query.source) {
    case 'top_models_by_downloads':
      return await getModelsRepository(supabase).getTopByDownloads(
        query.params?.query || '',  // Pass query for reranking
        limit,
        query.params?.authors?.[0] ? { author: query.params.authors[0] } : undefined
      )

    case 'top_repos_by_stars':
      return await getReposRepository(supabase).getTopByStars(
        query.params?.query || '',  // Pass query for reranking
        limit,
        query.params?.owners?.[0] ? { owner: query.params.owners[0] } : undefined
      )

    case 'search_trends':
      return await getTrendsRepository(supabase).getTopTrends(limit)

    case 'vector_search_unified': {
      const originalQuery = query.params?.query || ''

      // Build filters from LLM planner if available
      const filters: any = {}

      if ((query.params as any)?.doc_type_weights) {
        filters.doc_type_weights = (query.params as any).doc_type_weights
        console.log(`${LOG_PREFIX.PLAN} Using LLM-guided doc_type weights:`, filters.doc_type_weights)
      }

      // Query expansion if enabled (from database)
      const featureFlags = getFeatureFlagService(supabase)
      const expansionEnabled = await featureFlags.isEnabled('query_expansion')

      if (expansionEnabled) {
        const queries = await expandQuery(originalQuery)
        console.log(`${LOG_PREFIX.SEARCH} Searching with ${queries.length} query variations`)

        // Search with all query variations in parallel
        const allResults = await Promise.all(
          queries.map(q => getHybridSearch(supabase).search(q, limit, filters))
        )

        // Merge and deduplicate by URL, keeping highest score
        const urlMap = new Map<string, SearchResult>()
        allResults.flat().forEach(result => {
          const existing = urlMap.get(result.url)
          if (!existing || (result.similarity || 0) > (existing.similarity || 0)) {
            urlMap.set(result.url, result)
          }
        })

        // Return top results sorted by similarity
        return Array.from(urlMap.values())
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, limit)
      }

      // Default: single query search with LLM-guided weights (if available)
      return await getHybridSearch(supabase).search(originalQuery, limit, filters)
    }

    default:
      console.error(`${LOG_PREFIX.ERROR} Unknown data source: ${query.source}`)
      return []
  }
}
