/**
 * Shared types for RAG chat system
 */

export type QueryIntent =
  | 'market_intelligence'  // Top models, popular frameworks, trending
  | 'implementation'       // How-to guides, tutorials, setup
  | 'troubleshooting'      // Fix errors, solve problems
  | 'comparison'           // Compare X vs Y
  | 'conceptual'           // Explain, what is, understand
  | 'invalid'              // Off-topic

export type DataSourceType =
  | 'keyword_search_models'
  | 'keyword_search_repos'
  | 'top_models_by_downloads'
  | 'top_repos_by_stars'
  | 'search_trends'
  | 'vector_search_unified'

export interface DataSourceQuery {
  source: DataSourceType
  params?: {
    query?: string
    model_names?: string[]
    repo_names?: string[]
    authors?: string[]
    owners?: string[]
    categories?: string[]
    limit?: number
  }
}

export interface QueryPlan {
  intent: QueryIntent
  confidence: number
  is_valid: boolean
  reason: string
  data_sources: DataSourceQuery[]
}

export interface SearchResult {
  id: string
  name: string
  description: string
  url: string
  doc_type: 'hf_model' | 'github_repo' | 'google_trend' | 'blog_article'
  similarity?: number
  rerank_score?: number
  // Model-specific
  downloads?: number
  likes?: number
  ranking_position?: number
  author?: string
  rag_category?: string
  // Repo-specific
  stars?: number
  forks?: number
  owner?: string
  language?: string
  // Trend-specific
  current_interest?: number
  avg_interest?: number
  peak_interest?: number
  trend_direction?: string
  // Blog-specific
  content?: string
}

export interface DataSourceResults {
  [key: string]: SearchResult[]
}
