/**
 * LLM Query Planner - Fast & Minimal
 * Uses only dynamic metadata from DB (no static taxonomy needed)
 * Routes queries to: semantic search, ranking, or comparison
 */

import type { QueryPlan } from './types.ts'
import { config } from './config.ts'

interface PlannerDecision {
  type: 'semantic' | 'ranking' | 'comparison'
  target: 'models' | 'repos' | 'both'
  category: string | null
  author: string | null
  names: string[] | null
}

/**
 * Fast LLM-based query planning with dynamic metadata from DB
 */
export async function createQueryPlan(
  query: string,
  top_k: number,
  supabase: any
): Promise<QueryPlan> {
  try {
    // Skip planner if disabled - use simple semantic search
    if (!config.features.queryPlanner.enabled) {
      return semanticSearch(query, top_k)
    }

    // Fetch metadata from DB (cache this for 1 hour in production)
    const { data: meta, error } = await supabase.rpc('get_filter_options')

    if (error || !meta) {
      console.error('⚠️ Metadata fetch failed:', error)
      return semanticSearch(query, top_k)
    }

    // Build compact prompt with dynamic metadata
    const prompt = `Route query to: semantic, ranking, or comparison.

Available categories: ${meta.categories?.join(', ') || 'none'}

Query: "${query}"

Rules:
- "top/best X" → ranking (no author/owner unless explicitly mentioned)
- "X vs Y" → comparison (extract names)
- "how/what/why" → semantic
- "models from [author]" or "repos by [owner]" → ranking with author/owner filter
- Extract author/owner ONLY if explicitly mentioned by name in query
- Match category if mentioned

JSON:
{
  "type": "semantic|ranking|comparison",
  "target": "models|repos|both",
  "category": null,
  "author": null,
  "names": null
}`

    // Call LLM (Ollama) with JSON format
    const response = await fetch(`${config.llm.url}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',  // Force JSON output
        options: {
          temperature: config.llm.planning.temperature,
          num_predict: config.llm.planning.maxTokens,
        },
      }),
    })

    if (!response.ok) {
      console.error('⚠️ LLM planning failed')
      return semanticSearch(query, top_k)
    }

    const data = await response.json()
    let content = data.message.content.trim()

    console.log('🔍 Raw LLM response:', content.substring(0, 200))

    // Try to extract JSON if wrapped in text/markdown
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                      content.match(/(\{[\s\S]*\})/)

    if (jsonMatch) {
      content = jsonMatch[1] || jsonMatch[0]
    }

    const decision: PlannerDecision = JSON.parse(content)

    console.log('🎯 Plan:', decision)

    return routeQuery(decision, query, top_k)

  } catch (error) {
    console.error('❌ Planning error:', error)
    return semanticSearch(query, top_k)
  }
}

/**
 * Route query based on LLM decision
 */
function routeQuery(decision: PlannerDecision, query: string, limit: number): QueryPlan {
  const { type, target, category, author, names } = decision

  // COMPARISON: "X vs Y" - use semantic search with query
  if (type === 'comparison' && names && names.length > 0) {
    return {
      intent: 'comparison',
      confidence: 0.95,
      is_valid: true,
      reason: `Comparing: ${names.join(' vs ')}`,
      data_sources: [{
        source: 'vector_search_unified',
        params: {
          query: `${names.join(' ')} comparison features differences`,
          limit
        }
      }]
    }
  }

  // RANKING: "top X models/repos"
  if (type === 'ranking') {
    const source = target === 'repos' ? 'top_repos_by_stars' : 'top_models_by_downloads'

    return {
      intent: 'market_intelligence',
      confidence: 0.95,
      is_valid: true,
      reason: `Top ${target}${category ? ` in ${category}` : ''}`,
      data_sources: [{
        source,
        params: {
          limit,
          categories: category ? [category] : undefined,
          authors: author && target === 'models' ? [author] : undefined,
          owners: author && target === 'repos' ? [author] : undefined
        }
      }]
    }
  }

  // SEMANTIC: everything else (default)
  return semanticSearch(query, limit, category, target)
}

/**
 * Semantic search fallback
 */
function semanticSearch(
  query: string,
  limit: number,
  category: string | null = null,
  target: string | null = null
): QueryPlan {
  return {
    intent: 'conceptual',
    confidence: 1.0,
    is_valid: true,
    reason: 'Semantic search',
    data_sources: [{
      source: 'vector_search_unified',
      params: {
        query,
        limit
      }
    }]
  }
}
