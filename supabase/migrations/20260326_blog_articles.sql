-- ============================================================================
-- Blog Articles Table - For RAG troubleshooting content
-- ============================================================================

-- Blog articles from various sources (LangChain, LlamaIndex, Pinecone, etc.)
CREATE TABLE IF NOT EXISTS blog_articles (
    id TEXT PRIMARY KEY,  -- Hash of URL for deduplication
    url TEXT UNIQUE NOT NULL,  -- Article URL (unique constraint prevents duplicates)
    title TEXT NOT NULL,
    author TEXT,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    content TEXT NOT NULL,  -- Full article content (markdown or plain text)
    excerpt TEXT,  -- Short summary/excerpt
    source TEXT NOT NULL,  -- e.g., "langchain", "llamaindex", "pinecone"
    tags TEXT[],  -- Article tags/categories
    rag_topics TEXT[],  -- e.g., ["chunking", "embedding", "retrieval"]

    -- Scraping metadata
    scrape_method TEXT NOT NULL,  -- "sitemap", "rss"
    scraped_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes for efficient querying
    CONSTRAINT valid_scrape_method CHECK (scrape_method IN ('sitemap', 'rss'))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS blog_articles_source_idx ON blog_articles(source);
CREATE INDEX IF NOT EXISTS blog_articles_published_at_idx ON blog_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS blog_articles_scraped_at_idx ON blog_articles(scraped_at DESC);
CREATE INDEX IF NOT EXISTS blog_articles_tags_idx ON blog_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS blog_articles_rag_topics_idx ON blog_articles USING GIN(rag_topics);

-- Enable RLS (service role bypasses this)
DO $$
BEGIN
    ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE blog_articles IS 'RAG-related blog articles from LangChain, LlamaIndex, Pinecone, etc. for troubleshooting assistance';

-- ============================================================================
-- Blog Documents Vector Table - Separate from ragnosis_docs
-- ============================================================================

-- Blog article embeddings (separate from models/repos for clean schema)
-- Supports chunking: long articles split into multiple chunks
CREATE TABLE IF NOT EXISTS blog_docs (
    id TEXT PRIMARY KEY,  -- article_id or article_id_chunk_N
    parent_id TEXT,  -- NULL for whole articles, article_id for chunks
    chunk_index INT DEFAULT 0,  -- 0 for whole article, 1+ for chunks

    name TEXT NOT NULL,  -- Article title (or section title for chunks)
    description TEXT,  -- Chunk content (or full content if not chunked)
    url TEXT NOT NULL,  -- Article URL
    source TEXT NOT NULL,  -- "langchain", "llamaindex", "pinecone", etc.

    -- Blog-specific metadata
    published_at TIMESTAMPTZ,  -- Article publish date (for recency ranking)
    rag_topics TEXT[],  -- ["embedding", "retrieval", "chunking"]
    scrape_method TEXT,  -- "sitemap" or "rss"

    -- Vector search fields
    text TEXT NOT NULL,  -- Preview text for display
    embedding vector(384),  -- Embedding of chunk content

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (IVFFlat for fast approximate search)
CREATE INDEX IF NOT EXISTS blog_docs_embedding_idx ON blog_docs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS blog_docs_source_idx ON blog_docs(source);
CREATE INDEX IF NOT EXISTS blog_docs_published_at_idx ON blog_docs(published_at DESC);  -- For recency ranking
CREATE INDEX IF NOT EXISTS blog_docs_rag_topics_idx ON blog_docs USING GIN(rag_topics);  -- For topic filtering
CREATE INDEX IF NOT EXISTS blog_docs_created_at_idx ON blog_docs(created_at DESC);
CREATE INDEX IF NOT EXISTS blog_docs_parent_id_idx ON blog_docs(parent_id) WHERE parent_id IS NOT NULL;  -- For chunk retrieval

-- Enable RLS (service role bypasses this)
DO $$
BEGIN
    ALTER TABLE blog_docs ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE blog_docs IS 'Vector embeddings for blog articles - separate from ragnosis_docs (models/repos) for clean schema';
