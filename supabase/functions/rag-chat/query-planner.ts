/**
 * Query Planner (Phase 1.3)
 * Maps user query intent to relevant tags and search filters
 */

import { extractQueryTags, RAG_TAXONOMY, getCategoryForTag } from '../_shared/tag-taxonomy.ts'
import type { SearchFilters } from './search/hybrid-search.ts'

export interface QueryPlan {
  originalQuery: string
  extractedTags: string[]
  suggestedFilters: SearchFilters
  category?: string
  confidence: number
}

export class QueryPlanner {
  /**
   * Analyze query and create search plan with tag-based filters
   */
  plan(query: string): QueryPlan {
    console.log(`🎯 Planning query: "${query}"`)

    // Extract relevant tags from query
    const extractedTags = extractQueryTags(query)

    // Determine primary category if tags point to one
    const category = this.inferCategory(extractedTags)

    // Build suggested filters
    const suggestedFilters: SearchFilters = {}

    // Add tag filters if we found relevant tags
    if (extractedTags.length > 0) {
      suggestedFilters.tags = extractedTags
    }

    // Infer doc_type from query patterns
    const docType = this.inferDocType(query)
    if (docType) {
      suggestedFilters.doc_type = docType
    }

    // Add category filter if confident
    if (category) {
      suggestedFilters.category = category
    }

    const confidence = this.calculateConfidence(extractedTags, category)

    const plan: QueryPlan = {
      originalQuery: query,
      extractedTags,
      suggestedFilters,
      category,
      confidence,
    }

    console.log(`📋 Query plan:`, {
      tags: extractedTags.length,
      category,
      confidence: confidence.toFixed(2),
    })

    return plan
  }

  /**
   * Infer primary RAG category from extracted tags
   */
  private inferCategory(tags: string[]): string | undefined {
    if (tags.length === 0) return undefined

    // Count tags per category
    const categoryCounts = new Map<string, number>()

    tags.forEach(tag => {
      const category = getCategoryForTag(tag)
      if (category) {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)
      }
    })

    if (categoryCounts.size === 0) return undefined

    // Return category with most tag matches
    const [topCategory] = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])

    return topCategory[0]
  }

  /**
   * Infer document type from query patterns
   */
  private inferDocType(query: string): 'hf_model' | 'github_repo' | 'blog_article' | undefined {
    const queryLower = query.toLowerCase()

    // Model indicators
    if (
      queryLower.includes('model') ||
      queryLower.includes('embedding') ||
      queryLower.includes('rerank') ||
      queryLower.includes('transformer')
    ) {
      return 'hf_model'
    }

    // Repo indicators
    if (
      queryLower.includes('framework') ||
      queryLower.includes('library') ||
      queryLower.includes('tool') ||
      queryLower.includes('github') ||
      queryLower.includes('repository')
    ) {
      return 'github_repo'
    }

    // Blog/article indicators
    if (
      queryLower.match(/^(what|how|why|explain|understand|guide|tutorial)/) ||
      queryLower.includes('article') ||
      queryLower.includes('blog')
    ) {
      return 'blog_article'
    }

    return undefined
  }

  /**
   * Calculate confidence score for the plan
   */
  private calculateConfidence(tags: string[], category?: string): number {
    let confidence = 0.5 // Base confidence

    // Boost for tag matches
    if (tags.length > 0) {
      confidence += Math.min(tags.length * 0.15, 0.3)
    }

    // Boost for category inference
    if (category) {
      confidence += 0.2
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * Expand query with related tags (for future use)
   */
  expandQuery(query: string, tags: string[]): string {
    if (tags.length === 0) return query

    // Add top 3 most relevant tags to query
    const topTags = tags.slice(0, 3).join(' ')
    return `${query} ${topTags}`
  }
}
