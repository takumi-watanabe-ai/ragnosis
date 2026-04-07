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
  insight?: QueryInsight  // Optional query insights for UI display
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

  // Citation support - for inline references and document viewing
  marker?: string            // Citation marker (e.g., "[1]", "[KB-1]")
  chunk_text?: string        // Actual text snippet from the source document
  chunk_id?: string          // Unique identifier for this chunk
  char_offset?: number       // Character offset in original document
  chunk_length?: number      // Length of the chunk in characters
}

/**
 * LLM-extracted query insights for weighted multi-source search
 */
export type PrimaryIntent =
  | 'learn'          // Conceptual understanding (how/what/why)
  | 'find_tool'      // Looking for specific models/repos/frameworks
  | 'compare'        // Comparing options
  | 'troubleshoot'   // Solving problems
  | 'implement'      // Implementation guidance

export interface DocTypeWeights {
  knowledge_base: number  // 0.0 - 1.0
  hf_model: number
  github_repo: number
}

export interface QueryFilters {
  task?: string          // HF task type (e.g., "feature-extraction")
  language?: string      // Programming language (e.g., "Python")
  attributes?: string[]  // Query attributes (e.g., ["multilingual", "fast"])
}

export interface QueryInsight {
  primary_intent: PrimaryIntent
  doc_type_weights: DocTypeWeights
  expanded_query?: string
  nouns?: string[]  // Key nouns/entities for BM25 boosting
  confidence: number
  reason: string
}

/**
 * Progress event for streaming real-time updates to frontend
 */
export interface ProgressEvent {
  type: 'progress'
  step: string
  message: string
}

/**
 * Progress emitter interface for streaming real-time updates
 */
export interface ProgressEmitter {
  emit(step: string, message: string): void
}
