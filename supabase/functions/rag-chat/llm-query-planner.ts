/**
 * LLM Query Planner - Weighted Multi-Source Approach
 *
 * Returns query insights with doc_type weights instead of hard routing.
 * Always searches ALL sources, but uses LLM to extract intent and weights.
 */

import type { QueryInsight, PrimaryIntent, DocTypeWeights, QueryPlan } from './types.ts'
import { config } from './config.ts'
import { getLLMClient } from './services/llm-client.ts'
import { getFeatureFlagService } from './services/feature-flags.ts'
import { THRESHOLDS, WEIGHTS, LOG_PREFIX } from './utils/constants.ts'

interface LLMInsightResponse {
  primary_intent: PrimaryIntent
  doc_type_weights: DocTypeWeights
  nouns?: string[] | null
  expanded_query?: string | null
}

/**
 * Get LLM-based query insights with doc_type weights
 * Returns null if planner is disabled or fails
 */
async function getQueryInsight(
  query: string,
  supabase: any
): Promise<QueryInsight | null> {
  try {
    // Check if query planner is enabled (from database)
    const featureFlags = getFeatureFlagService(supabase)
    const isEnabled = await featureFlags.isEnabled('query_planner')

    if (!isEnabled) {
      return null
    }

    // Get planner config to check if weights should be used
    const plannerConfig = await featureFlags.getConfig<{ model?: string; use_weights?: boolean }>('query_planner')
    const useWeights = plannerConfig.use_weights !== false  // Default to true

    // Fetch minimal metadata from DB
    const { data: meta, error } = await supabase.rpc('get_filter_options')

    if (error || !meta) {
      console.error(`${LOG_PREFIX.WARNING} Metadata fetch failed:`, error)
      return null
    }

    // Build LLM prompt for query understanding
    const prompt = buildInsightPrompt(query, meta)

    // Call LLM with automatic JSON parsing
    const llmClient = getLLMClient()
    const llmResponse = await llmClient.chatJson<LLMInsightResponse>(prompt)

    if (!llmResponse) {
      console.error(`${LOG_PREFIX.WARNING} LLM insight extraction failed`)
      return null
    }

    // Validate weights (ensure they're between 0 and 1)
    const weights = normalizeWeights(llmResponse.doc_type_weights)

    const insight: QueryInsight = {
      primary_intent: llmResponse.primary_intent,
      doc_type_weights: useWeights ? weights : undefined,  // Only include weights if enabled
      nouns: llmResponse.nouns || undefined,
      expanded_query: llmResponse.expanded_query || undefined,
      confidence: 0.8,
      reason: `Intent: ${llmResponse.primary_intent}`,
    }

    console.log(`${LOG_PREFIX.PLAN} Query Insight:`, JSON.stringify(insight, null, 2))
    if (!useWeights) {
      console.log(`${LOG_PREFIX.INFO} Doc type weighting disabled via feature flag config`)
    }

    return insight

  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Query insight error:`, error)
    return null
  }
}

/**
 * Build LLM prompt for extracting query insights
 */
function buildInsightPrompt(query: string, meta: any): string {
  const availableTasks = meta.tasks?.slice(0, THRESHOLDS.MAX_TASKS_IN_PROMPT) || []

  return `Analyze this query and extract insights for weighted multi-source search.

Query: "${query}"

Available model tasks: ${availableTasks.join(', ')}

Your job:
1. Understand the PRIMARY INTENT
2. Assign WEIGHTS (0.0-1.0) to each doc_type based on relevance
3. Extract KEY NOUNS/ENTITIES for BM25 boosting (ONLY from the actual query - do NOT add related terms)
4. Optionally expand the query for better search

Intent types:
- "learn": Conceptual questions (how/what/why/explain)
- "find_tool": Looking for specific models/repos/frameworks (best/top/recommend)
- "compare": Comparing options (X vs Y, difference between)
- "troubleshoot": Solving problems (fix/error/issue)
- "implement": Implementation guidance (how to build/setup)

Doc types:
- "knowledge_base": Documentation, tutorials, explanations (Qdrant, Pinecone, ChromaDB docs)
- "hf_model": HuggingFace models (embeddings, LLMs, etc.)
- "github_repo": GitHub repositories (frameworks, tools, libraries)

Weight guidelines:
- Conceptual questions (how/what/why): Prioritize knowledge_base
- Model/tool search queries: Prioritize hf_model and/or github_repo
- Comparison questions: Balance knowledge_base with relevant tool types
- Implementation questions: Balance knowledge_base with code repositories

**IMPORTANT**:
- Always search ALL doc types. Weights determine relevance, not exclusion.
- Extract nouns/entities ONLY from the actual query text - do not infer or add related concepts.
- If the query contains just one key term, return just that one term.
- Nouns should be actual words or phrases that appear in the query, not conceptually related terms.
- Keep response concise - only fill optional fields if clearly relevant.

Respond with VALID JSON only (no trailing text):
{
  "primary_intent": "learn|find_tool|compare|troubleshoot|implement",
  "doc_type_weights": {
    "knowledge_base": 0.0-1.0,
    "hf_model": 0.0-1.0,
    "github_repo": 0.0-1.0
  },
  "nouns": ["key", "terms", "entities"],
  "expanded_query": null
}`
}

/**
 * Normalize weights to ensure they're between 0 and 1
 */
function normalizeWeights(weights: DocTypeWeights): DocTypeWeights {
  const defaults = WEIGHTS.DEFAULT_DOC_WEIGHTS
  return {
    knowledge_base: Math.max(0, Math.min(1, weights.knowledge_base || defaults.knowledge_base)),
    hf_model: Math.max(0, Math.min(1, weights.hf_model || defaults.hf_model)),
    github_repo: Math.max(0, Math.min(1, weights.github_repo || defaults.github_repo)),
  }
}

/**
 * Create query plan - backward compatible interface
 * Routes to ranking sources for find_tool intent, otherwise uses weighted multi-source
 */
export async function createQueryPlan(
  query: string,
  top_k: number,
  supabase: any
): Promise<QueryPlan> {
  // Get LLM insights (returns null if disabled or fails)
  const insight = await getQueryInsight(query, supabase)

  // Map primary intent to legacy QueryIntent
  const intent = insight ? mapPrimaryIntentToQueryIntent(insight.primary_intent) : 'conceptual'

  // Smart routing for find_tool intent
  if (insight?.primary_intent === 'find_tool') {
    const weights = insight.doc_type_weights
    const preferModels = weights && weights.hf_model > weights.github_repo

    // Detect pure discovery queries (top, best, popular, etc.)
    const isPureDiscovery = /^(what are |which are |show me )?(the )?(top|best|most popular|popular|leading|trending|recommended|highest rated)/i.test(query.trim())

    if (isPureDiscovery) {
      // PURE DISCOVERY: Route to ranking endpoints with task filtering
      // Extract task/category from query using LLM nouns
      const taskFilter = insight?.nouns?.[0] || null
      
      const dataSource = preferModels
        ? {
            source: 'top_models_by_downloads' as const,
            params: {
              query: taskFilter || query, // Use extracted noun for filtering
              limit: top_k,
              task_filter: taskFilter // Will be used for task-based filtering
            }
          }
        : {
            source: 'top_repos_by_stars' as const,
            params: {
              query: taskFilter || query,
              limit: top_k,
              topic_filter: taskFilter // Will be used for topic-based filtering
            }
          }

      console.log(`${LOG_PREFIX.PLAN} Pure discovery query - routing to ${dataSource.source}${taskFilter ? ` with filter: ${taskFilter}` : ''}`)

      return {
        intent,
        confidence: insight?.confidence || 1.0,
        is_valid: true,
        reason: `Discovery query - ranking by ${preferModels ? 'downloads' : 'stars'}${taskFilter ? ` filtered by "${taskFilter}"` : ''}`,
        data_sources: [dataSource],
        insight: insight || undefined
      }
    }

    // SEMANTIC SEARCH: Query has specific context, use weighted semantic search
    console.log(`${LOG_PREFIX.PLAN} Contextual tool query - using semantic search with augmentation`)
  }

  // Default: use vector_search_unified for semantic matching + diversification
  // Doc_type_weights guide relevance via augmentation and retrieval weighting
  const dataSource = {
    source: 'vector_search_unified' as const,
    params: {
      query: insight?.expanded_query || query,
      limit: top_k,
      ...(insight && {
        doc_type_weights: insight.doc_type_weights,
        nouns: insight.nouns
      })
    }
  }

  return {
    intent,
    confidence: insight?.confidence || 1.0,
    is_valid: true,
    reason: insight?.reason || 'Multi-source semantic search with weighted retrieval',
    data_sources: [dataSource],
    insight: insight || undefined
  }
}

/**
 * Map new PrimaryIntent to legacy QueryIntent
 */
function mapPrimaryIntentToQueryIntent(primary: PrimaryIntent): 'market_intelligence' | 'implementation' | 'troubleshooting' | 'comparison' | 'conceptual' {
  switch (primary) {
    case 'find_tool':
      return 'market_intelligence'
    case 'implement':
      return 'implementation'
    case 'troubleshoot':
      return 'troubleshooting'
    case 'compare':
      return 'comparison'
    case 'learn':
    default:
      return 'conceptual'
  }
}
