-- ============================================================================
-- Public Vector Search - Unified documents table
-- Public API with validation - delegates to private schema
-- ============================================================================

DROP FUNCTION IF EXISTS public.vector_search_documents(vector, integer, text, text);

CREATE OR REPLACE FUNCTION public.vector_search_documents(
    query_embedding vector(384),
    match_limit INTEGER DEFAULT 10,
    filter_doc_type TEXT DEFAULT NULL,
    filter_rag_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'query_embedding is required');
    END IF;

    IF match_limit < 1 OR match_limit > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_limit must be between 1 and 100');
    END IF;

    IF filter_doc_type IS NOT NULL AND filter_doc_type NOT IN ('hf_model', 'github_repo', 'blog_article') THEN
        RETURN jsonb_build_object('success', false, 'error', 'filter_doc_type must be hf_model, github_repo, or blog_article');
    END IF;

    -- Call private function
    v_result := private.search_documents(
        query_embedding,
        match_limit,
        filter_doc_type,
        filter_rag_category
    );

    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'results', v_result,
            'count', jsonb_array_length(v_result),
            'search_type', 'vector'
        )
    );
END;
$$;

COMMENT ON FUNCTION public.vector_search_documents IS 'Unified vector search across all document types with input validation';
