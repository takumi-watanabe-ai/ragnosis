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
    weights?: {
      docs: number
      structured: number
    }
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
  doc_type: 'hf_model' | 'github_repo' | 'google_trend' | 'knowledge_base'
  similarity?: number
  rerank_score?: number
  vector_similarity?: number  // Original semantic similarity from vector search
  bm25_rank?: number          // Original BM25 rank from text search

  // Categorization & tags
  topics?: string[]  // Tags/topics from HF/GitHub

  // Model-specific
  downloads?: number
  likes?: number
  author?: string
  task?: string  // NEW: HF model task type

  // Repo-specific
  stars?: number
  forks?: number
  owner?: string
  language?: string

  // Shared metrics
  ranking_position?: number

  // Trend-specific
  current_interest?: number
  avg_interest?: number
  peak_interest?: number

  // Knowledge base-specific
  content?: string
  published_at?: string
  content_source?: string  // Knowledge base source

  // Metadata tracking
  snapshot_date?: string
}

export interface DataSourceResults {
  [key: string]: SearchResult[]
}
