// Shared types for RAGnosis edge functions

export interface DocumentResult {
  id: string
  name: string
  description: string
  url: string
  doc_type: 'hf_model' | 'github_repo' | 'blog_article'
  rag_category?: string
  topics?: string[]
  similarity: number

  // Metadata (already included from unified documents table)
  downloads?: number
  likes?: number
  stars?: number
  forks?: number
  ranking_position?: number
  language?: string
  author?: string
  owner?: string
  task?: string
  published_at?: string
  content_source?: string
  snapshot_date?: string
}

export interface QueryRequest {
  query: string
  top_k?: number
  filter_doc_type?: 'hf_model' | 'github_repo' | 'blog_article'
  filter_rag_category?: string
}

export interface QueryResponse {
  answer: string
  sources: DocumentResult[]
  confidence: 'high' | 'medium' | 'low'
  count: number
}
