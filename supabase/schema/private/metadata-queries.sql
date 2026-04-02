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
'Minimal metadata for LLM planner: top 20 authors/owners. Cache for 1 hour.';

-- ============================================================================
-- Get Available Tags
-- Returns normalized tags available in the system for filtering
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_available_tags(limit_val INT DEFAULT 100)
RETURNS TABLE (
    tag TEXT,
    usage_count BIGINT,
    doc_types TEXT[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        unnest_tag AS tag,
        COUNT(*)::BIGINT AS usage_count,
        array_agg(DISTINCT doc_type ORDER BY doc_type)::TEXT[] AS doc_types
    FROM (
        SELECT
            unnest(topics) AS unnest_tag,
            doc_type
        FROM documents
        WHERE topics IS NOT NULL AND array_length(topics, 1) > 0
    ) t
    WHERE unnest_tag IS NOT NULL
      AND unnest_tag != ''
    GROUP BY unnest_tag
    ORDER BY usage_count DESC
    LIMIT limit_val;
END;
$$;

COMMENT ON FUNCTION private.get_available_tags IS
'Returns normalized tags with usage counts for analytics and filtering. Default limit: 100.';
