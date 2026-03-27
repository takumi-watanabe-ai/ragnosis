-- ============================================================================
-- Hybrid Search: Add Full-Text Search Indexes
-- Migration only creates tables/indexes/schemas, functions go in schema/
-- ============================================================================

-- Create private schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS private;

-- Full-text search indexes for keyword matching (BM25-like)

CREATE INDEX IF NOT EXISTS hf_models_fts_idx ON hf_models
  USING gin(to_tsvector('english',
    coalesce(model_name, '') || ' ' ||
    coalesce(author, '') || ' ' ||
    coalesce(description, '')
  ));

CREATE INDEX IF NOT EXISTS github_repos_fts_idx ON github_repos
  USING gin(to_tsvector('english',
    coalesce(repo_name, '') || ' ' ||
    coalesce(owner, '') || ' ' ||
    coalesce(description, '')
  ));

CREATE INDEX IF NOT EXISTS blog_docs_fts_idx ON blog_docs
  USING gin(to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(description, '')
  ));
