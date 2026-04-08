/**
 * Unified data source interface
 * Thin coordinator that routes to appropriate repositories
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  DataSourceQuery,
  SearchResult,
  ProgressEmitter,
} from "./types.ts";
import { config } from "./config.ts";
import { HybridSearch } from "./search/hybrid-search.ts";
import { ModelsRepository } from "./sources/models-repository.ts";
import { ReposRepository } from "./sources/repos-repository.ts";
import { TrendsRepository } from "./sources/trends-repository.ts";
import { expandQuery } from "./query-expander.ts";
import { getFeatureFlagService } from "./services/feature-flags.ts";
import { LOG_PREFIX } from "./utils/constants.ts";

// Lazy-initialized instances (per supabase client)
let hybridSearch: HybridSearch | null = null;
let modelsRepository: ModelsRepository | null = null;
let reposRepository: ReposRepository | null = null;
let trendsRepository: TrendsRepository | null = null;

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
        descriptionMax: config.search.context.descriptionMax,
      },
      config.embedding.model,
    );
  }
  return hybridSearch;
}

/**
 * Get or create models repository instance
 */
function getModelsRepository(supabase: SupabaseClient): ModelsRepository {
  if (!modelsRepository) {
    modelsRepository = new ModelsRepository(supabase);
  }
  return modelsRepository;
}

/**
 * Get or create repos repository instance
 */
function getReposRepository(supabase: SupabaseClient): ReposRepository {
  if (!reposRepository) {
    reposRepository = new ReposRepository(supabase);
  }
  return reposRepository;
}

/**
 * Get or create trends repository instance
 */
function getTrendsRepository(supabase: SupabaseClient): TrendsRepository {
  if (!trendsRepository) {
    trendsRepository = new TrendsRepository(supabase);
  }
  return trendsRepository;
}

/**
 * Execute a single data source query
 */
export async function executeDataSource(
  query: DataSourceQuery,
  supabase: SupabaseClient,
  progress?: ProgressEmitter,
): Promise<{ primary: SearchResult[]; duplicates: SearchResult[] }> {
  const limit = query.params?.limit || 5;

  switch (query.source) {
    case "top_models_by_downloads": {
      const modelsFilters: any = {};
      if (query.params?.authors?.[0]) {
        modelsFilters.author = query.params.authors[0];
      }
      if ((query.params as any)?.task_filter) {
        modelsFilters.task = (query.params as any).task_filter;
      }

      return {
        primary: await getModelsRepository(supabase).getTopByDownloads(
          query.params?.query || "",
          limit,
          Object.keys(modelsFilters).length > 0 ? modelsFilters : undefined,
        ),
        duplicates: [],
      };
    }

    case "top_repos_by_stars": {
      const reposFilters: any = {};
      if (query.params?.owners?.[0]) {
        reposFilters.owner = query.params.owners[0];
      }
      if ((query.params as any)?.topic_filter) {
        reposFilters.topic = (query.params as any).topic_filter;
      }

      return {
        primary: await getReposRepository(supabase).getTopByStars(
          query.params?.query || "",
          limit,
          Object.keys(reposFilters).length > 0 ? reposFilters : undefined,
        ),
        duplicates: [],
      };
    }

    case "search_trends":
      return {
        primary: await getTrendsRepository(supabase).getTopTrends(limit),
        duplicates: [],
      };

    case "vector_search_unified": {
      const originalQuery = query.params?.query || "";

      // Build filters from LLM planner if available
      const filters: any = {};

      if ((query.params as any)?.doc_type_weights) {
        filters.doc_type_weights = (query.params as any).doc_type_weights;
        console.log(
          `${LOG_PREFIX.PLAN} Using LLM-guided doc_type weights:`,
          filters.doc_type_weights,
        );
      }

      if ((query.params as any)?.nouns) {
        filters.nouns = (query.params as any).nouns;
        console.log(
          `${LOG_PREFIX.PLAN} Using extracted nouns for BM25 boosting:`,
          filters.nouns,
        );
      }

      // Query expansion if enabled (from database) and not explicitly skipped
      const featureFlags = getFeatureFlagService(supabase);
      const expansionEnabled = await featureFlags.isEnabled("query_expansion");
      const skipExpansion = (query.params as any)?.skip_expansion === true;

      if (expansionEnabled && !skipExpansion) {
        if (progress) {
          progress.emit(
            "query_expander",
            `Expanding query into 3 diverse search variations...`,  // Always 2 variations + 1 original
          );
        }

        const queries = await expandQuery(originalQuery, progress);
        console.log(
          `${LOG_PREFIX.SEARCH} Searching with ${queries.length} query variations`,
        );

        if (progress) {
          progress.emit(
            "search_engine",
            "Searching multiple data sources in parallel...",
          );
        }

        // Search with all query variations in parallel
        // Skip per-query reranking to keep more diverse candidates
        const perQueryLimit = config.search.candidateCount;
        const allResults = await Promise.all(
          queries.map(
            (q, idx) =>
              getHybridSearch(supabase).search(
                q,
                perQueryLimit,
                filters,
                idx === 0,
                true,
              ), // skipFinalReranking=true
          ),
        );

        const allFlat = allResults.flat();
        const totalBeforeRerank = allFlat.length;

        // Count by doc type before processing
        const docTypeCountsBefore = allFlat.reduce(
          (acc, r) => {
            const type = r.doc_type || "unknown";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        // CRITICAL: Rerank ALL candidates BEFORE deduplication
        // This ensures we keep the best-ranked version of each URL
        console.log(
          `🔄 Reranking all ${totalBeforeRerank} candidates before deduplication...`,
        );
        const rerankedAll = await getHybridSearch(supabase).rerankResults(
          originalQuery,
          allFlat,
          totalBeforeRerank, // Keep all results, just rerank them
        );

        // Now deduplicate by URL, keeping highest reranked score as primary
        // Save lower-scored duplicates for potential refinement in later iterations
        const urlMap = new Map<string, SearchResult>();
        const duplicates: SearchResult[] = [];

        rerankedAll.forEach((result) => {
          const existing = urlMap.get(result.url);
          if (!existing) {
            urlMap.set(result.url, result);
          } else if ((result.similarity || 0) > (existing.similarity || 0)) {
            // New result is better - swap them
            duplicates.push(existing);
            urlMap.set(result.url, result);
          } else {
            // Existing is better - save this as duplicate
            duplicates.push(result);
          }
        });

        const uniqueCount = urlMap.size;
        const diversityPercent = Math.round(
          (uniqueCount / totalBeforeRerank) * 100,
        );
        console.log(
          `📊 Query expansion: ${totalBeforeRerank} total → ${uniqueCount} unique URLs after dedup (${diversityPercent}% diversity)`,
        );

        // Duplicates are already sorted by rerank score (descending) from rerankedAll
        // Just need to take top N unique results
        const expandedLimit = config.search.finalResultCount;
        const sortedPrimary = Array.from(urlMap.values()).slice(
          0,
          expandedLimit,
        );

        console.log(
          `✅ Returning top ${sortedPrimary.length} primary results + ${duplicates.length} duplicates for potential refinement`,
        );

        if (progress) {
          const typeBreakdown = Object.entries(docTypeCountsBefore)
            .map(([type, count]) => {
              const label =
                type === "hf_model"
                  ? "Hugging Face models"
                  : type === "github_repo"
                    ? "GitHub repos"
                    : type === "knowledge_base"
                      ? "articles"
                      : type;
              return `${count} ${label}`;
            })
            .join(", ");

          progress.emit(
            "search_engine",
            `Found ${totalBeforeRerank} results across ${queries.length} queries: ${typeBreakdown}`,
          );

          progress.emit(
            "search_engine",
            `Selected ${sortedPrimary.length} most relevant sources from ${totalBeforeRerank} candidates`,
          );
        }

        return {
          primary: sortedPrimary,
          duplicates,
        };
      }

      // Non-expansion path
      if (progress) {
        progress.emit("search_engine", "Searching data sources...");
      }

      return {
        primary: await getHybridSearch(supabase).search(
          originalQuery,
          limit,
          filters,
        ),
        duplicates: [],
      };
    }

    default:
      console.error(`${LOG_PREFIX.ERROR} Unknown data source: ${query.source}`);
      return { primary: [], duplicates: [] };
  }
}
