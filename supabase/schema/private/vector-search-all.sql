-- Private vector search - no validation, just query execution

DROP FUNCTION IF EXISTS private.vector_search_all_docs(vector, integer);

CREATE OR REPLACE FUNCTION private.vector_search_all_docs(
    query_embedding vector(384),
    match_limit INTEGER
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    url TEXT,
    doc_type TEXT,
    source TEXT,
    rag_topics TEXT[],
    published_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE SQL
AS $$
    (
        -- Search ragnosis_docs (models/repos)
        SELECT
            id, name, description, url, doc_type,
            NULL::TEXT as source,
            NULL::TEXT[] as rag_topics,
            NULL::TIMESTAMPTZ as published_at,
            1 - (embedding <=> query_embedding) AS similarity
        FROM ragnosis_docs
        ORDER BY embedding <=> query_embedding
        LIMIT match_limit
    )

    UNION ALL

    (
        -- Search blog_docs
        SELECT
            id, name, description, url,
            'blog_article'::TEXT as doc_type,
            source,
            rag_topics,
            published_at,
            1 - (embedding <=> query_embedding) AS similarity
        FROM blog_docs
        ORDER BY embedding <=> query_embedding
        LIMIT match_limit
    )

    ORDER BY similarity DESC
    LIMIT match_limit;
$$;
