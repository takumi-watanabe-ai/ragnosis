-- ============================================================================
-- Private Vector Search - Unified documents table
-- Internal implementation - no validation
-- ============================================================================

CREATE OR REPLACE FUNCTION private.search_documents(
    query_embedding vector(384),
    match_limit INTEGER,
    filter_doc_type TEXT,
    filter_rag_category TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_results JSONB;
BEGIN
    -- Call match_documents function and format results
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'name', d.name,
            'description', d.description,
            'url', d.url,
            'doc_type', d.doc_type,
            'rag_category', d.rag_category,
            'topics', d.topics,
            'text', d.text,
            'similarity', d.similarity,
            'downloads', d.downloads,
            'stars', d.stars,
            'likes', d.likes,
            'forks', d.forks,
            'ranking_position', d.ranking_position,
            'author', d.author,
            'owner', d.owner,
            'language', d.language,
            'task', d.task,
            'published_at', d.published_at,
            'content_source', d.content_source,
            'snapshot_date', d.snapshot_date
        ) ORDER BY d.similarity DESC
    )
    INTO v_results
    FROM match_documents(
        query_embedding,
        match_limit,
        filter_doc_type,
        filter_rag_category
    ) d;

    RETURN COALESCE(v_results, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION private.search_documents IS 'Internal vector search on unified documents table';
