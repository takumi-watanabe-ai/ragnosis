-- ============================================================================
-- RAGnosis Unified Schema - Fresh Start
-- Single documents table for models, repos, and blog articles
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- SCHEMAS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS shared;

-- Grant permissions on schemas
GRANT USAGE, CREATE ON SCHEMA private TO postgres;
GRANT USAGE, CREATE ON SCHEMA shared TO postgres;
GRANT USAGE ON SCHEMA private TO service_role;  -- Edge functions need access to call private functions
GRANT USAGE ON SCHEMA shared TO service_role;

-- ============================================================================
-- UNIFIED DOCUMENTS TABLE
-- Combines ragnosis_docs + blog_docs into single searchable collection
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
    -- Universal identity
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT,
    doc_type TEXT NOT NULL,  -- 'hf_model' | 'github_repo' | 'blog_article'

    -- Universal categorization
    topics TEXT[],            -- GitHub topics / rag topics / tags (universal)

    -- Vector search
    text TEXT NOT NULL,       -- Preview text for display
    embedding vector(384),    -- Semantic embedding

    -- Metadata tracking
    snapshot_date DATE,       -- When this data snapshot was taken (NULL for blogs)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- ========================================================================
    -- METRICS (type-specific, nullable)
    -- ========================================================================
    downloads BIGINT,         -- HF models: download count
    stars INT,                -- GitHub repos: star count
    likes INT,                -- HF models: like count
    forks INT,                -- GitHub repos: fork count
    ranking_position INT,     -- Overall ranking in source platform

    -- ========================================================================
    -- CREATORS (type-specific, nullable)
    -- ========================================================================
    author TEXT,              -- HF models: author (e.g., "openai", "sentence-transformers")
    owner TEXT,               -- GitHub repos: owner (e.g., "langchain-ai", "qdrant")

    -- ========================================================================
    -- TECHNICAL DETAILS (type-specific, nullable)
    -- ========================================================================
    language TEXT,            -- GitHub repos: primary language
    task TEXT,                -- HF models: task type (e.g., "text-classification", "feature-extraction")

    -- ========================================================================
    -- CONTENT METADATA (blogs only, nullable)
    -- ========================================================================
    published_at TIMESTAMPTZ, -- Blog articles: publish date
    content_source TEXT,      -- Blog articles: source site (e.g., "langchain", "llamaindex")
    scrape_method TEXT,       -- Blog articles: how it was scraped ("sitemap", "rss")

    -- ========================================================================
    -- CHUNKING (blogs only, but could be universal)
    -- ========================================================================
    parent_id TEXT,           -- For chunks: parent document ID (NULL for whole documents)
    chunk_index INT DEFAULT 0, -- For chunks: index (0 for whole documents)

    -- Constraints
    CONSTRAINT valid_doc_type CHECK (doc_type IN ('hf_model', 'github_repo', 'blog_article')),
    CONSTRAINT valid_scrape_method CHECK (scrape_method IS NULL OR scrape_method IN ('sitemap', 'rss'))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Vector search (primary use case)
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Basic lookups and filtering
CREATE INDEX IF NOT EXISTS documents_doc_type_idx ON documents(doc_type);
CREATE INDEX IF NOT EXISTS documents_name_idx ON documents(name);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS documents_snapshot_date_idx ON documents(snapshot_date DESC);

-- Metrics-based sorting (partial indexes for performance)
CREATE INDEX IF NOT EXISTS documents_downloads_idx ON documents(downloads DESC) WHERE downloads IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_stars_idx ON documents(stars DESC) WHERE stars IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_ranking_position_idx ON documents(ranking_position) WHERE ranking_position IS NOT NULL;

-- Content metadata (for blogs)
CREATE INDEX IF NOT EXISTS documents_published_at_idx ON documents(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_content_source_idx ON documents(content_source) WHERE content_source IS NOT NULL;

-- Array fields (GIN indexes for containment queries)
CREATE INDEX IF NOT EXISTS documents_topics_idx ON documents USING GIN(topics) WHERE topics IS NOT NULL;

-- Chunking (for retrieving related chunks)
CREATE INDEX IF NOT EXISTS documents_parent_id_idx ON documents(parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================================
-- TIME-SERIES TABLES (for historical tracking)
-- ============================================================================

-- HuggingFace models (historical snapshots)
CREATE TABLE IF NOT EXISTS hf_models (
    id TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    model_name TEXT NOT NULL,
    author TEXT,
    task TEXT,
    downloads BIGINT DEFAULT 0,
    likes INT DEFAULT 0,
    ranking_position INT,
    tags TEXT[],
    url TEXT,
    last_updated TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS hf_models_snapshot_date_idx ON hf_models(snapshot_date);
CREATE INDEX IF NOT EXISTS hf_models_ranking_position_idx ON hf_models(ranking_position);

-- GitHub repos (historical snapshots)
CREATE TABLE IF NOT EXISTS github_repos (
    id TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    repo_name TEXT NOT NULL,
    owner TEXT,
    stars INT DEFAULT 0,
    forks INT DEFAULT 0,
    watchers INT DEFAULT 0,
    language TEXT,
    topics TEXT[],
    ranking_position INT,
    url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS github_repos_snapshot_date_idx ON github_repos(snapshot_date);
CREATE INDEX IF NOT EXISTS github_repos_ranking_position_idx ON github_repos(ranking_position);
CREATE INDEX IF NOT EXISTS github_repos_stars_idx ON github_repos(stars DESC);

-- Blog articles (source content before chunking)
CREATE TABLE IF NOT EXISTS blog_articles (
    id TEXT PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    content TEXT NOT NULL,
    excerpt TEXT,
    source TEXT NOT NULL,
    tags TEXT[],
    rag_topics TEXT[],
    scrape_method TEXT NOT NULL,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_scrape_method CHECK (scrape_method IN ('sitemap', 'rss'))
);

CREATE INDEX IF NOT EXISTS blog_articles_source_idx ON blog_articles(source);
CREATE INDEX IF NOT EXISTS blog_articles_published_at_idx ON blog_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS blog_articles_scraped_at_idx ON blog_articles(scraped_at DESC);
CREATE INDEX IF NOT EXISTS blog_articles_tags_idx ON blog_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS blog_articles_rag_topics_idx ON blog_articles USING GIN(rag_topics);

-- Google Trends (time-series analytics)
CREATE TABLE IF NOT EXISTS google_trends (
    id TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    category TEXT,
    current_interest INT,
    avg_interest FLOAT,
    peak_interest INT,
    time_series JSONB,
    related_queries JSONB,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS google_trends_keyword_idx ON google_trends(keyword);

-- ============================================================================
-- SECURITY: RLS enabled, service role bypasses
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hf_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_trends ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by Python scripts and edge functions)
-- No policies needed = only service role can access (secure by default)

-- Set default privileges for future functions
-- Private schema: Only service_role and postgres (NOT anon for security)
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT EXECUTE ON FUNCTIONS TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA shared GRANT EXECUTE ON FUNCTIONS TO postgres, service_role;

-- Public schema: anon can execute (API layer with validation)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, service_role, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE documents IS 'Unified vector search table for HF models, GitHub repos, and blog articles';
COMMENT ON COLUMN documents.doc_type IS 'Document type: hf_model, github_repo, or blog_article';
COMMENT ON COLUMN documents.topics IS 'Universal topics field: GitHub topics for repos, rag_topics for blogs';
COMMENT ON COLUMN documents.downloads IS 'HuggingFace model downloads (NULL for repos/blogs)';
COMMENT ON COLUMN documents.stars IS 'GitHub repo stars (NULL for models/blogs)';
COMMENT ON COLUMN documents.author IS 'HuggingFace model author (NULL for repos/blogs)';
COMMENT ON COLUMN documents.owner IS 'GitHub repo owner (NULL for models/blogs)';
COMMENT ON COLUMN documents.task IS 'HuggingFace model task type (NULL for repos/blogs)';
COMMENT ON COLUMN documents.language IS 'GitHub repo primary language (NULL for models/blogs)';
COMMENT ON COLUMN documents.content_source IS 'Blog source site: langchain, llamaindex, etc. (NULL for models/repos)';
COMMENT ON COLUMN documents.parent_id IS 'Parent document ID for chunks (NULL for whole documents)';
COMMENT ON COLUMN documents.chunk_index IS 'Chunk index (0 for whole documents, 1+ for chunks)';
