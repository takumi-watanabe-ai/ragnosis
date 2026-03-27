/**
 * Query Planner - Step 1: Analyze + Plan
 * Single LLM call to determine intent and plan data sources
 */

import type { QueryPlan } from './types.ts'
import { config } from './config.ts'

/**
 * Analyze query and create execution plan
 */
export async function createQueryPlan(query: string, top_k: number = 5): Promise<QueryPlan> {
  const prompt = buildPlanningPrompt(query, top_k)

  try {
    const response = await fetch(`${config.llm.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: {
          temperature: config.llm.planning.temperature,
          num_predict: config.llm.planning.maxTokens
        }
      })
    })

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`)
    }

    const data = await response.json()
    const parsed = JSON.parse(data.response.trim())

    console.log(`📋 Query plan:`, JSON.stringify(parsed, null, 2))

    return parsed
  } catch (error) {
    console.error('❌ Planning failed:', error)

    // Fallback plan
    return {
      intent: 'conceptual',
      confidence: 0.3,
      is_valid: true,
      reason: 'Failed to parse query, using fallback',
      data_sources: [{
        source: 'vector_search_unified',
        params: { query, limit: top_k }
      }]
    }
  }
}

function buildPlanningPrompt(query: string, top_k: number): string {
  return `You are a query planner for a RAG system about ML/AI. Analyze the query and create an execution plan.

QUESTION: "${query}"

OUTPUT VALID JSON ONLY:
{
  "intent": "market_intelligence|implementation|troubleshooting|comparison|conceptual|invalid",
  "confidence": 0.0-1.0,
  "is_valid": true|false,
  "reason": "brief explanation",
  "data_sources": [
    {
      "source": "keyword_search_models|keyword_search_repos|top_models_by_downloads|top_repos_by_stars|search_trends|vector_search_unified",
      "params": {
        "query": "search text",
        "model_names": ["specific", "models"],
        "repo_names": ["specific", "repos"],
        "authors": ["company"],
        "owners": ["company"],
        "categories": ["embedding", "reranking"],
        "limit": ${top_k}
      }
    }
  ]
}

VALIDATION: Mark is_valid=false ONLY for clearly off-topic queries (sports, weather, cooking, entertainment).
If the query mentions tools, frameworks, models, or concepts you don't recognize, still mark is_valid=true.
The search will find the answer - your job is just to route it correctly.

ROUTING LOGIC:
- Questions about tools/concepts (even unknown ones) → vector_search_unified
- HOW/WHAT/WHY/EXPLAIN/SIMILAR → vector_search_unified
- TOP/POPULAR models/embeddings → top_models_by_downloads
- TOP/POPULAR frameworks/tools/repos → top_repos_by_stars
- TREND DATA (time-series) → search_trends

Examples:
"What is X?" or "Similar to X?" → vector_search_unified (even if X is unknown)
"Top frameworks" → top_repos_by_stars
"Top models" → top_models_by_downloads

CRITICAL: Don't hallucinate params. Only set params you actually need (query, limit).

RESPOND WITH VALID JSON ONLY.`
}
