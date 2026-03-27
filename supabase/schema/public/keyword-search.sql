-- RAGnosis Public API Functions - Hybrid Search
-- Public interface - validates input and delegates to private schema
-- Combines vector similarity with keyword matching for better entity/name matching

-- ============================================================================
-- Keyword Search (for entity-specific queries)
-- ============================================================================

-- Keyword search for models - handles "what model does X use" queries
CREATE OR REPLACE FUNCTION public.keyword_search_models(
    search_query TEXT,
    query_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF search_query IS NULL OR LENGTH(TRIM(search_query)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Search query is required');
    END IF;

    IF query_limit < 1 OR query_limit > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limit must be between 1 and 50');
    END IF;

    v_result := private.search_models(search_query, query_limit);

    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'results', v_result,
            'count', jsonb_array_length(v_result),
            'search_type', 'keyword'
        )
    );
END;
$$;

COMMENT ON FUNCTION public.keyword_search_models IS 'Keyword/BM25 search for models - better for entity names like "Supabase", "OpenAI"';

-- Keyword search for repos
CREATE OR REPLACE FUNCTION public.keyword_search_repos(
    search_query TEXT,
    query_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF search_query IS NULL OR LENGTH(TRIM(search_query)) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Search query is required');
    END IF;

    IF query_limit < 1 OR query_limit > 50 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Limit must be between 1 and 50');
    END IF;

    v_result := private.search_repos(search_query, query_limit);

    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'results', v_result,
            'count', jsonb_array_length(v_result),
            'search_type', 'keyword'
        )
    );
END;
$$;

COMMENT ON FUNCTION public.keyword_search_repos IS 'Keyword/BM25 search for repos';

