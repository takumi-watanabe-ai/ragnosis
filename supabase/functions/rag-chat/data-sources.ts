/**
 * Unified data source interface
 * Thin coordinator that routes to appropriate repositories
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { DataSourceQuery, SearchResult, ProgressEmitter } from './types.ts'
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
  supabase: SupabaseClient,
  progress?: ProgressEmitter
): Promise<{ primary: SearchResult[], duplicates: SearchResult[] }> {
  const limit = query.params?.limit || 5

  switch (query.source) {
    case 'top_models_by_downloads':
      return {
        primary: await getModelsRepository(supabase).getTopByDownloads(
          query.params?.query || '',
          limit,
          query.params?.authors?.[0] ? { author: query.params.authors[0] } : undefined
        ),
        duplicates: []
      }

    case 'top_repos_by_stars':
      return {
        primary: await getReposRepository(supabase).getTopByStars(
          query.params?.query || '',
          limit,
          query.params?.owners?.[0] ? { owner: query.params.owners[0] } : undefined
        ),
        duplicates: []
      }

    case 'search_trends':
      return {
        primary: await getTrendsRepository(supabase).getTopTrends(limit),
        duplicates: []
      }

    case 'vector_search_unified': {
      const originalQuery = query.params?.query || ''

      // Build filters from LLM planner if available
      const filters: any = {}

      if ((query.params as any)?.doc_type_weights) {
        filters.doc_type_weights = (query.params as any).doc_type_weights
        console.log(`${LOG_PREFIX.PLAN} Using LLM-guided doc_type weights:`, filters.doc_type_weights)
      }

      if ((query.params as any)?.nouns) {
        filters.nouns = (query.params as any).nouns
        console.log(`${LOG_PREFIX.PLAN} Using extracted nouns for BM25 boosting:`, filters.nouns)
      }

      // Query expansion if enabled (from database)
      const featureFlags = getFeatureFlagService(supabase)
      const expansionEnabled = await featureFlags.isEnabled('query_expansion')

      if (expansionEnabled) {
        if (progress) {
          progress.emit('expansion_start', `Expanding query into ${config.features.queryExpansion.maxVariations + 1} diverse search variations...`)
        }

        const queries = await expandQuery(originalQuery, progress)
        console.log(`${LOG_PREFIX.SEARCH} Searching with ${queries.length} query variations`)

        if (progress) {
          progress.emit('search_start', 'Searching multiple data sources in parallel...')
        }

        // Search with all query variations in parallel
        const perQueryLimit = config.search.candidateCount
        const allResults = await Promise.all(
          queries.map((q, idx) => getHybridSearch(supabase).search(q, perQueryLimit, filters, idx === 0))
        )

        const allFlat = allResults.flat()
        const totalBeforeDedup = allFlat.length

        // Count by doc type before dedup
        const docTypeCountsBefore = allFlat.reduce((acc, r) => {
          const type = r.doc_type || 'unknown'
          acc[type] = (acc[type] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        // Deduplicate by URL, keeping highest score as primary
        // Save lower-scored duplicates for potential refinement use
        const urlMap = new Map<string, SearchResult>()
        const duplicates: SearchResult[] = []

        allFlat.forEach(result => {
          const existing = urlMap.get(result.url)
          if (!existing) {
            urlMap.set(result.url, result)
          } else if ((result.similarity || 0) > (existing.similarity || 0)) {
            // New result is better - swap them
            duplicates.push(existing)
            urlMap.set(result.url, result)
          } else {
            // Existing is better - save this as duplicate
            duplicates.push(result)
          }
        })

        const uniqueCount = urlMap.size
        const diversityPercent = Math.round((uniqueCount / totalBeforeDedup) * 100)
        console.log(`📊 Query expansion: ${totalBeforeDedup} total results → ${uniqueCount} unique URLs after dedup (${diversityPercent}% diversity)`)

        // Sort duplicates by similarity (best first) for later use
        duplicates.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

        const expandedLimit = limit * queries.length
        const sortedPrimary = Array.from(urlMap.values())
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, expandedLimit)

        console.log(`✅ Returning top ${sortedPrimary.length} primary results + ${duplicates.length} duplicates for potential refinement`)

        if (progress) {
          const typeBreakdown = Object.entries(docTypeCountsBefore)
            .map(([type, count]) => {
              const label = type === 'hf_model' ? 'HF models'
                : type === 'github_repo' ? 'GitHub repos'
                : type === 'knowledge_base' ? 'articles'
                : type;
              return `${count} ${label}`;
            })
            .join(', ');

          progress.emit('search_results_initial',
            `Found ${totalBeforeDedup} results across ${queries.length} queries: ${typeBreakdown}`
          );

          progress.emit('search_dedup', `Selected ${sortedPrimary.length} most relevant sources from ${totalBeforeDedup} candidates`)
        }

        return {
          primary: sortedPrimary,
          duplicates
        }
      }

      // Non-expansion path
      if (progress) {
        progress.emit('search_start', 'Searching data sources...')
      }

      return {
        primary: await getHybridSearch(supabase).search(originalQuery, limit, filters),
        duplicates: []
      }
    }

    default:
      console.error(`${LOG_PREFIX.ERROR} Unknown data source: ${query.source}`)
      return { primary: [], duplicates: [] }
  }
}
