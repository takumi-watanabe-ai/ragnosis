-- ============================================================================
-- Vector Search Function for Blog Documents
-- ============================================================================

-- Create match_blog_docs function (similar to match_documents but for blog_docs)
CREATE OR REPLACE FUNCTION match_blog_docs(
    query_embedding vector(384),
    match_count INT DEFAULT 5,
    filter_source TEXT DEFAULT NULL,  -- Filter by source: "langchain", "pinecone", etc.
    filter_rag_topic TEXT DEFAULT NULL  -- Filter by RAG topic
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    url TEXT,
    source TEXT,
    rag_topics TEXT[],
    published_at TIMESTAMPTZ,
    text TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        blog_docs.id,
        blog_docs.name,
        blog_docs.description,
        blog_docs.url,
        blog_docs.source,
        blog_docs.rag_topics,
        blog_docs.published_at,
        blog_docs.text,
        1 - (blog_docs.embedding <=> query_embedding) AS similarity
    FROM blog_docs
    WHERE
        (filter_source IS NULL OR blog_docs.source = filter_source)
        AND (filter_rag_topic IS NULL OR filter_rag_topic = ANY(blog_docs.rag_topics))
    ORDER BY blog_docs.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_blog_docs IS 'Vector similarity search for blog articles with optional source/topic filtering';
