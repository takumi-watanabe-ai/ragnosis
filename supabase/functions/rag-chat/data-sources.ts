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

      // Query expansion if enabled
      if (config.features.queryExpansion.enabled) {
        const queries = await expandQuery(originalQuery)
        console.log(`🔄 Searching with ${queries.length} query variations`)

        // Search with all query variations in parallel
        const allResults = await Promise.all(
          queries.map(q => getHybridSearch().search(q, limit))
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

      // Default: single query search
      return await getHybridSearch().search(originalQuery, limit)
    }

    default:
      console.error(`Unknown data source: ${query.source}`)
      return []
  }
}
