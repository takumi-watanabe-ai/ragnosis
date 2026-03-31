-- ============================================================================
-- Metadata for LLM Query Planner
-- Returns available filter values (categories, top authors/owners)
-- Cache this for 1 hour to reduce DB load
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_filter_options()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'categories', (
            SELECT array_agg(DISTINCT rag_category ORDER BY rag_category)
            FROM documents
            WHERE rag_category IS NOT NULL
        ),
        'authors', (
            SELECT array_agg(author ORDER BY total_downloads DESC)
            FROM (
                SELECT author, SUM(downloads) as total_downloads
                FROM documents
                WHERE doc_type = 'hf_model' AND author IS NOT NULL
                GROUP BY author
                ORDER BY total_downloads DESC
                LIMIT 20
            ) t
        ),
        'owners', (
            SELECT array_agg(owner ORDER BY total_stars DESC)
            FROM (
                SELECT owner, SUM(stars) as total_stars
                FROM documents
                WHERE doc_type = 'github_repo' AND owner IS NOT NULL
                GROUP BY owner
                ORDER BY total_stars DESC
                LIMIT 20
            ) t
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION private.get_filter_options IS
'Minimal metadata for LLM planner: categories + top 20 authors/owners. Cache for 1 hour.';
