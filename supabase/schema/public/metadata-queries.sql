-- ============================================================================
-- Public Metadata Queries
-- Exposes private.get_filter_options() to edge functions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_filter_options()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT private.get_filter_options();
$$;

COMMENT ON FUNCTION get_filter_options IS
'Get available filter options for query planner (categories, authors, owners).';
