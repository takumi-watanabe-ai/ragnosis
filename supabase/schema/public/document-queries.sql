-- ============================================================================
-- Public Document Queries
-- Exposes private document query functions to edge functions
-- ============================================================================

-- ============================================================================
-- RANKING QUERIES
-- ============================================================================

CREATE OR REPLACE FUNCTION get_top_models(
    match_limit INTEGER DEFAULT 10,
    filter_author TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT private.get_top_models(match_limit, filter_author);
$$;

COMMENT ON FUNCTION get_top_models IS
'Get top HuggingFace models by downloads with optional filters.';

CREATE OR REPLACE FUNCTION get_top_repos(
    match_limit INTEGER DEFAULT 10,
    filter_owner TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT private.get_top_repos(match_limit, filter_owner);
$$;

COMMENT ON FUNCTION get_top_repos IS
'Get top GitHub repos by stars with optional filters.';

-- ============================================================================
-- COMPARISON QUERIES
-- ============================================================================

CREATE OR REPLACE FUNCTION get_by_names(
    document_names TEXT[]
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT private.get_by_names(document_names);
$$;

COMMENT ON FUNCTION get_by_names IS
'Get documents by name for comparisons (e.g., "langchain vs llamaindex").';

-- ============================================================================
-- UTILITY QUERIES
-- ============================================================================

CREATE OR REPLACE FUNCTION filter_new_urls(urls_to_check TEXT[])
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT private.filter_new_urls(urls_to_check);
$$;

COMMENT ON FUNCTION filter_new_urls IS
'Returns URLs from input array that are NOT in documents table. Used by embedding pipeline to identify which models/repos/articles need content fetching and embedding. Performs filtering server-side for efficiency.';
