/**
 * Query Planner - Step 1: Analyze + Plan
 * Single LLM call to determine intent and plan data sources
 */

import type { QueryPlan } from './types.ts'
import { config } from './config.ts'

/**
 * Analyze query and create execution plan using hybrid routing
 * Routes explicit ranking queries to specialized DB functions
 * Everything else goes to semantic search
 */
export async function createQueryPlan(query: string, top_k: number = 5): Promise<QueryPlan> {
  const lowerQuery = query.toLowerCase()

  // ROUTE 1: Explicit "top X embedding/reranking models" → Direct DB ranking
  // Pattern: "top/best/most popular/show me" + number? + "embedding/reranking" + "models"
  const modelRankingPatterns = [
    /\b(top|best|most popular|show me|list)\s+(\d+\s+)?(embedding|reranking|sentence[\s-]?transformer)s?\s+models?\b/,
    /\b(top|best|most popular)\s+(\d+\s+)?models?\s+(for\s+)?(embedding|reranking)\b/,
    /\bmost popular embedding model\b/
  ]

  for (const pattern of modelRankingPatterns) {
    if (pattern.test(lowerQuery)) {
      console.log(`📋 Route: top_models_by_downloads (explicit model ranking query)`)
      return {
        intent: 'market_intelligence',
        confidence: 0.95,
        is_valid: true,
        reason: 'Explicit model ranking query - using direct DB sort',
        data_sources: [{
          source: 'top_models_by_downloads',
          params: { limit: top_k }
        }]
      }
    }
  }

  // ROUTE 2: Explicit "top X repos/frameworks" → Direct DB ranking
  // Pattern: "top/best/most popular/show me" + number? + "repo/framework/library"
  const repoRankingPatterns = [
    /\b(top|best|most popular|show me|list)\s+(\d+\s+)?(rag\s+)?(repos?|repositories|frameworks?|libraries)\b/,
    /\b(top|best|most popular)\s+(\d+\s+)?github\s+repos?\b/,
    /\bwhat are the top.*repos?\b/
  ]

  for (const pattern of repoRankingPatterns) {
    if (pattern.test(lowerQuery)) {
      console.log(`📋 Route: top_repos_by_stars (explicit repo ranking query)`)
      return {
        intent: 'market_intelligence',
        confidence: 0.95,
        is_valid: true,
        reason: 'Explicit repo ranking query - using direct DB sort',
        data_sources: [{
          source: 'top_repos_by_stars',
          params: { limit: top_k }
        }]
      }
    }
  }

  // ROUTE: Semantic search (hybrid vector + BM25)
  console.log(`📋 Route: vector_search_unified (semantic search)`)

  return {
    intent: 'conceptual',
    confidence: 1.0,
    is_valid: true,
    reason: 'Using unified semantic search',
    data_sources: [{
      source: 'vector_search_unified',
      params: { query, limit: top_k }
    }]
  }
}

