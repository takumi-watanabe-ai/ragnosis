-- ============================================================================
-- RAGnosis Database Schema - Day 1
-- Complete fresh start with security-first design
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Tables
-- ============================================================================

-- Vector embeddings for RAG-related models and repos
-- Stores name + description embeddings for semantic search
-- LLM agent queries this for semantic matching, then enriches from SQL tables
CREATE TABLE IF NOT EXISTS ragnosis_docs (
    id TEXT PRIMARY KEY,  -- e.g., "hf_model_xxx" or "github_repo_xxx" (joins with SQL tables)
    name TEXT NOT NULL,  -- Model/repo name
    description TEXT,  -- Model/repo description
    url TEXT,  -- HuggingFace or GitHub URL
    doc_type TEXT NOT NULL,  -- "hf_model" or "github_repo"
    rag_category TEXT,  -- e.g., "embedding", "generation", "rag_tool"
    text TEXT NOT NULL,  -- Preview text for display (name + description snippet)
    embedding vector(384),  -- Embedding of name + description
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for fast approximate search)
CREATE INDEX IF NOT EXISTS ragnosis_docs_embedding_idx ON ragnosis_docs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for filtering and lookups (all entries are RAG-related by design)
CREATE INDEX IF NOT EXISTS ragnosis_docs_doc_type_idx ON ragnosis_docs(doc_type);
CREATE INDEX IF NOT EXISTS ragnosis_docs_rag_category_idx ON ragnosis_docs(rag_category);
CREATE INDEX IF NOT EXISTS ragnosis_docs_name_idx ON ragnosis_docs(name);
CREATE INDEX IF NOT EXISTS ragnosis_docs_created_at_idx ON ragnosis_docs(created_at DESC);

-- HuggingFace models (time-series analytics)
CREATE TABLE IF NOT EXISTS hf_models (
    id TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    model_name TEXT NOT NULL,
    author TEXT,
    task TEXT,
    downloads BIGINT DEFAULT 0,
    likes INT DEFAULT 0,
    ranking_position INT,
    is_rag_related BOOLEAN DEFAULT FALSE,
    rag_category TEXT,
    tags TEXT[],
    description TEXT,
    url TEXT,
    last_updated TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS hf_models_snapshot_date_idx ON hf_models(snapshot_date);
CREATE INDEX IF NOT EXISTS hf_models_ranking_position_idx ON hf_models(ranking_position);
CREATE INDEX IF NOT EXISTS hf_models_is_rag_related_idx ON hf_models(is_rag_related, rag_category);

-- GitHub repos (time-series analytics)
CREATE TABLE IF NOT EXISTS github_repos (
    id TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    repo_name TEXT NOT NULL,
    owner TEXT,
    description TEXT,
    stars INT DEFAULT 0,
    forks INT DEFAULT 0,
    watchers INT DEFAULT 0,
    language TEXT,
    topics TEXT[],
    ranking_position INT,
    is_rag_related BOOLEAN DEFAULT FALSE,
    rag_category TEXT,
    url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS github_repos_snapshot_date_idx ON github_repos(snapshot_date);
CREATE INDEX IF NOT EXISTS github_repos_ranking_position_idx ON github_repos(ranking_position);
CREATE INDEX IF NOT EXISTS github_repos_is_rag_related_idx ON github_repos(is_rag_related, rag_category);
CREATE INDEX IF NOT EXISTS github_repos_stars_idx ON github_repos(stars DESC);

-- Google Trends (time-series analytics)
CREATE TABLE IF NOT EXISTS google_trends (
    id TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    keyword TEXT NOT NULL,
    category TEXT,
    geo TEXT,
    timeframe TEXT,
    current_interest INT,
    avg_interest FLOAT,
    peak_interest INT,
    trend_direction TEXT,
    time_series JSONB,
    related_queries JSONB,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS google_trends_snapshot_date_idx ON google_trends(snapshot_date);
CREATE INDEX IF NOT EXISTS google_trends_keyword_idx ON google_trends(keyword);

-- ============================================================================
-- Functions
-- ============================================================================

-- Vector similarity search function
-- Returns semantically similar RAG models/repos based on embedding similarity
-- Note: All entries are already RAG-related (filtered during ingestion)
-- LLM agent uses this to find relevant items, then enriches from SQL tables
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(384),
    match_count INT DEFAULT 5,
    filter_doc_type TEXT DEFAULT NULL,
    filter_rag_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    url TEXT,
    doc_type TEXT,
    rag_category TEXT,
    text TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ragnosis_docs.id,
        ragnosis_docs.name,
        ragnosis_docs.description,
        ragnosis_docs.url,
        ragnosis_docs.doc_type,
        ragnosis_docs.rag_category,
        ragnosis_docs.text,
        1 - (ragnosis_docs.embedding <=> query_embedding) AS similarity
    FROM ragnosis_docs
    WHERE
        (filter_doc_type IS NULL OR ragnosis_docs.doc_type = filter_doc_type)
        AND (filter_rag_category IS NULL OR ragnosis_docs.rag_category = filter_rag_category)
    ORDER BY ragnosis_docs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Analytics: RAG market share over time
CREATE OR REPLACE FUNCTION get_rag_market_share_daily()
RETURNS TABLE (date DATE, total_models BIGINT, rag_models BIGINT, rag_percentage NUMERIC)
SECURITY INVOKER
LANGUAGE sql
AS $$
    SELECT
        snapshot_date,
        COUNT(*),
        COUNT(*) FILTER (WHERE is_rag_related),
        ROUND(100.0 * COUNT(*) FILTER (WHERE is_rag_related) / COUNT(*), 2)
    FROM hf_models
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC;
$$;

-- Analytics: Top RAG frameworks
CREATE OR REPLACE FUNCTION get_top_rag_frameworks()
RETURNS TABLE (
    repo_name TEXT, stars INT, forks INT, rag_category TEXT,
    ranking_position INT, updated_at TIMESTAMPTZ, snapshot_date DATE
)
SECURITY INVOKER
LANGUAGE sql
AS $$
    SELECT DISTINCT ON (repo_name)
        repo_name, stars, forks, rag_category, ranking_position, updated_at, snapshot_date
    FROM github_repos
    WHERE is_rag_related = TRUE
    ORDER BY repo_name, snapshot_date DESC, stars DESC
    LIMIT 20;
$$;

-- Analytics: Trending RAG keywords
CREATE OR REPLACE FUNCTION get_trending_rag_keywords()
RETURNS TABLE (
    keyword TEXT, current_interest INT, avg_interest FLOAT,
    trend_direction TEXT, category TEXT, snapshot_date DATE
)
SECURITY INVOKER
LANGUAGE sql
AS $$
    SELECT DISTINCT ON (keyword)
        keyword, current_interest, avg_interest, trend_direction, category, snapshot_date
    FROM google_trends
    WHERE current_interest > avg_interest
    ORDER BY keyword, snapshot_date DESC, current_interest DESC;
$$;

-- ============================================================================
-- Security: RLS enabled, no public access
-- ============================================================================

DO $$
BEGIN
    ALTER TABLE ragnosis_docs ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE hf_models ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE google_trends ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Service role bypasses RLS (used by your Python ingestion scripts)
-- No policies = no public access = secure by default
