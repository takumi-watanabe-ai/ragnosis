-- RAGnosis Private Functions - Hybrid Search (Vector + Keyword)
-- Internal business logic - NOT directly accessible to users/edge functions
-- Fixes entity-specific queries like "what model does Supabase use"

-- ============================================================================
-- Full-Text Search Helpers (BM25-like keyword matching)
-- ============================================================================

-- Unified search for models: keyword + fallback
CREATE OR REPLACE FUNCTION private.search_models(
    search_query TEXT,
    query_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_models JSONB;
BEGIN
    -- Use websearch_to_tsquery for better natural language handling
    SELECT jsonb_agg(
        jsonb_build_object(
            'type', 'model',
            'id', m.id,
            'name', m.model_name,
            'author', m.author,
            'downloads', m.downloads,
            'likes', m.likes,
            'task', m.task,
            'rag_category', m.rag_category,
            'description', COALESCE(m.description, ''),
            'url', m.url,
            'similarity', m.rank
        ) ORDER BY m.rank DESC, m.downloads DESC
    )
    INTO v_models
    FROM (
        SELECT DISTINCT ON (id)
            *,
            ts_rank_cd(
                to_tsvector('english', model_name || ' ' || COALESCE(author, '') || ' ' || COALESCE(description, '')),
                websearch_to_tsquery('english', search_query)
            ) as rank
        FROM hf_models
        WHERE is_rag_related = TRUE
          AND (
              to_tsvector('english', model_name || ' ' || COALESCE(author, '') || ' ' || COALESCE(description, ''))
                  @@ websearch_to_tsquery('english', search_query)
              OR model_name ILIKE '%' || search_query || '%'
              OR author ILIKE '%' || search_query || '%'
          )
        ORDER BY id, snapshot_date DESC
    ) m
    WHERE m.rank > 0 OR m.model_name ILIKE '%' || search_query || '%'
    LIMIT query_limit;

    RETURN COALESCE(v_models, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION private.search_models IS 'Smart search for models - handles natural language queries';

-- Unified search for repos: keyword + fallback
CREATE OR REPLACE FUNCTION private.search_repos(
    search_query TEXT,
    query_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_repos JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'type', 'repo',
            'id', r.id,
            'name', r.repo_name,
            'author', r.owner,
            'stars', r.stars,
            'forks', r.forks,
            'language', r.language,
            'rag_category', r.rag_category,
            'description', COALESCE(r.description, ''),
            'url', r.url,
            'similarity', r.rank
        ) ORDER BY r.rank DESC, r.stars DESC
    )
    INTO v_repos
    FROM (
        SELECT DISTINCT ON (id)
            *,
            ts_rank_cd(
                to_tsvector('english', repo_name || ' ' || COALESCE(owner, '') || ' ' || COALESCE(description, '')),
                websearch_to_tsquery('english', search_query)
            ) as rank
        FROM github_repos
        WHERE is_rag_related = TRUE
          AND (
              to_tsvector('english', repo_name || ' ' || COALESCE(owner, '') || ' ' || COALESCE(description, ''))
                  @@ websearch_to_tsquery('english', search_query)
              OR repo_name ILIKE '%' || search_query || '%'
              OR owner ILIKE '%' || search_query || '%'
          )
        ORDER BY id, snapshot_date DESC
    ) r
    WHERE r.rank > 0 OR r.repo_name ILIKE '%' || search_query || '%'
    LIMIT query_limit;

    RETURN COALESCE(v_repos, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION private.search_repos IS 'Smart search for repos';

