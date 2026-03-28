/**
 * Query Planner - Step 1: Analyze + Plan
 * Single LLM call to determine intent and plan data sources
 */

import type { QueryPlan } from './types.ts'
import { config } from './config.ts'

/**
 * Analyze query and create execution plan using hybrid routing
 */
export async function createQueryPlan(query: string, top_k: number = 5): Promise<QueryPlan> {
  const lowerQuery = query.toLowerCase()

  // RULE 1: Explicit ranking queries for models
  // Pattern: "top/best/most popular/leading" + "models/embeddings/reranking"
  const modelRankingPatterns = [
    /\b(top|best|most popular|leading|highest)\s+\d*\s*(embedding|reranking|sentence[\s-]?transformer)s?\s+models?\b/,
    /\b(top|best|most popular)\s+\d*\s*models?\s+(for|by)\s+(embedding|reranking|downloads)/,
    /\bwhat are the (top|best|most popular)\s+.*models?\b/
  ]

  for (const pattern of modelRankingPatterns) {
    if (pattern.test(lowerQuery)) {
      const categories = extractCategories(lowerQuery)
      console.log(`📋 Rule-based routing: top_models_by_downloads`)
      return {
        intent: 'market_intelligence',
        confidence: 0.95,
        is_valid: true,
        reason: 'Explicit model ranking query detected',
        data_sources: [{
          source: 'top_models_by_downloads',
          params: { categories, limit: top_k }
        }]
      }
    }
  }

  // RULE 2: Explicit ranking queries for repos/frameworks
  // Pattern: "top/best/most popular" + "frameworks/repos/libraries/databases"
  const repoRankingPatterns = [
    /\b(top|best|most popular|leading)\s+\d*\s*(rag|vector)?\s*(frameworks?|repos?|repositories|libraries|databases?)\b/,
    /\b(most starred|highest stars?)\s+(rag|vector)?\s*(frameworks?|repos?)\b/
  ]

  for (const pattern of repoRankingPatterns) {
    if (pattern.test(lowerQuery)) {
      const categories = extractCategories(lowerQuery)
      console.log(`📋 Rule-based routing: top_repos_by_stars`)
      return {
        intent: 'market_intelligence',
        confidence: 0.95,
        is_valid: true,
        reason: 'Explicit repo ranking query detected',
        data_sources: [{
          source: 'top_repos_by_stars',
          params: { categories, limit: top_k }
        }]
      }
    }
  }

  // RULE 3: Trend queries
  if (/\b(trends?|trending|popularity over time|interest over time)\b/.test(lowerQuery)) {
    console.log(`📋 Rule-based routing: search_trends`)
    return {
      intent: 'market_intelligence',
      confidence: 0.9,
      is_valid: true,
      reason: 'Trend query detected',
      data_sources: [{
        source: 'search_trends',
        params: { limit: top_k }
      }]
    }
  }

  // RULE 4: Informational/implementation queries (semantic search)
  // Pattern: "how to", "best practices", "guide", "tutorial", "explain", "what is", comparisons
  const semanticPatterns = [
    /\b(how to|how do|guide to|tutorial)\b/,
    /\bbest practices?\b/,
    /\b(what is|what are|what does|what do|explain|describe)\b/,
    /\b(which|should I|recommend|suggestion)\b/,
    /\b(vs|versus|compared to|difference between|compare)\b/,
    /\b(implement|deploy|set up|configure|integrate|fix|solve|improve|optimize)\b/,
    /\b(use|uses|using)\b/
  ]

  for (const pattern of semanticPatterns) {
    if (pattern.test(lowerQuery)) {
      console.log(`📋 Rule-based routing: vector_search_unified`)
      return {
        intent: 'implementation',
        confidence: 0.9,
        is_valid: true,
        reason: 'Informational/implementation query detected',
        data_sources: [{
          source: 'vector_search_unified',
          params: { query, limit: top_k }
        }]
      }
    }
  }

  // FALLBACK: Use LLM for ambiguous queries
  console.log(`📋 LLM-based routing (ambiguous query)`)
  return await llmBasedRouting(query, top_k)
}

/**
 * Extract rag_category from query
 */
function extractCategories(query: string): string[] | undefined {
  const categories: string[] = []
  if (/\bembedd?ing\b/i.test(query)) categories.push('embedding')
  if (/\brerank(ing)?\b/i.test(query)) categories.push('reranking')
  if (/\brag[\s-]?tool\b/i.test(query)) categories.push('rag_tool')
  if (/\bvector[\s-]?db|vector database\b/i.test(query)) categories.push('vector_db')
  return categories.length > 0 ? categories : undefined
}

/**
 * LLM-based routing for ambiguous queries
 */
async function llmBasedRouting(query: string, top_k: number): Promise<QueryPlan> {
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

    console.log(`📋 LLM query plan:`, JSON.stringify(parsed, null, 2))

    return parsed
  } catch (error) {
    console.error('❌ Planning failed:', error)

    // Fallback to semantic search
    return {
      intent: 'conceptual',
      confidence: 0.3,
      is_valid: true,
      reason: 'Failed to parse query, using semantic search fallback',
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

ROUTING DECISION - Choose data source based on query type:

A. Query asks "top/best/most/leading/popular" + wants LIST of models
   → Use: top_models_by_downloads
   → Extract rag_category: "embedding", "reranking", etc.
   → Examples: "top embedding models", "best reranking models", "most popular models"

B. Query asks "top/best/most/leading/popular" + wants LIST of repos/frameworks
   → Use: top_repos_by_stars
   → Extract rag_category: "rag_tool", "vector_db", etc.
   → Examples: "best RAG frameworks", "most popular vector databases"

C. Query asks about trends/popularity over time
   → Use: search_trends

D. All other queries (explanations, how-to, what is X, comparisons)
   → Use: vector_search_unified

OUTPUT JSON:
{
  "intent": "market_intelligence|implementation|troubleshooting|comparison|conceptual|invalid",
  "confidence": 0.0-1.0,
  "is_valid": true|false,
  "reason": "brief explanation",
  "data_sources": [
    {
      "source": "top_models_by_downloads|top_repos_by_stars|search_trends|vector_search_unified",
      "params": {
        "query": "only for vector_search_unified",
        "categories": ["only if extractable from query"],
        "limit": ${top_k}
      }
    }
  ]
}

CRITICAL: "What are the top X models" → top_models_by_downloads NOT vector_search_unified

RESPOND WITH VALID JSON ONLY.`
}
