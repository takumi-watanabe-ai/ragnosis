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
import { expandQuery } from './query-expander.ts'
import { QueryPlanner } from './query-planner.ts'

const supabase = createClient(
  config.database.url,
  config.database.serviceRoleKey
)

// Lazy-initialized instances
let hybridSearch: HybridSearch | null = null
let queryPlanner: QueryPlanner | null = null

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
 * Get or create query planner instance
 */
function getQueryPlanner(): QueryPlanner {
  if (!queryPlanner) {
    queryPlanner = new QueryPlanner()
  }
  return queryPlanner
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
      return await new ModelsRepository(supabase).getTopByDownloads(
        query.params?.query || '',  // Pass query for reranking
        limit,
        {
          categories: query.params?.categories,
          authors: query.params?.authors
        }
      )

    case 'top_repos_by_stars':
      return await new ReposRepository(supabase).getTopByStars(
        query.params?.query || '',  // Pass query for reranking
        limit,
        {
          categories: query.params?.categories,
          owners: query.params?.owners
        }
      )

    case 'search_trends':
      return await new TrendsRepository(supabase).getTopTrends(limit)

    case 'vector_search_unified': {
      const originalQuery = query.params?.query || ''

      // Phase 1.3: Use query planner to extract tags and filters
      const plan = getQueryPlanner().plan(originalQuery)
      const filters = plan.suggestedFilters

      // Query expansion if enabled
      if (config.features.queryExpansion.enabled) {
        const queries = await expandQuery(originalQuery)
        console.log(`🔄 Searching with ${queries.length} query variations`)

        // Search with all query variations in parallel (with filters)
        const allResults = await Promise.all(
          queries.map(q => getHybridSearch().search(q, limit, filters))
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

      // Default: single query search with tag-based filters
      return await getHybridSearch().search(originalQuery, limit, filters)
    }

    default:
      console.error(`Unknown data source: ${query.source}`)
      return []
  }
}
