-- ============================================================================
-- Document Queries - Essential queries for LLM planner
-- All queries use documents table (vector DB with full context)
-- ============================================================================

-- ============================================================================
-- 1. RANKING - Top models by downloads (with optional filters)
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_top_models(
    match_limit INTEGER DEFAULT 10,
    filter_author TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB)
        FROM (
            SELECT
                id, name, description, url, doc_type,
                downloads, likes, author, task, topics
            FROM (
                SELECT DISTINCT ON (base_name)
                    id,
                    regexp_replace(name, ' \(part \d+/\d+\)$', '') as name,
                    base_name,
                    description, url, doc_type,
                    downloads, likes, author, task, topics
                FROM (
                    SELECT *,
                        regexp_replace(name, ' \(part \d+/\d+\)$', '') as base_name
                    FROM documents
                    WHERE doc_type = 'hf_model'
                      AND (filter_author IS NULL OR LOWER(author) = LOWER(filter_author))
                ) sub
                ORDER BY base_name, downloads DESC NULLS LAST
            ) deduped
            ORDER BY downloads DESC NULLS LAST
            LIMIT match_limit
        ) d
    );
END;
$$;

COMMENT ON FUNCTION private.get_top_models IS
'Get top HF models by downloads. Filters: author.';

-- ============================================================================
-- 2. RANKING - Top repos by stars (with optional filters)
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_top_repos(
    match_limit INTEGER DEFAULT 10,
    filter_owner TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB)
        FROM (
            SELECT
                id, name, description, url, doc_type,
                stars, forks, owner, language, topics
            FROM (
                SELECT DISTINCT ON (base_name)
                    id,
                    regexp_replace(name, ' \(part \d+/\d+\)$', '') as name,
                    base_name,
                    description, url, doc_type,
                    stars, forks, owner, language, topics
                FROM (
                    SELECT *,
                        regexp_replace(name, ' \(part \d+/\d+\)$', '') as base_name
                    FROM documents
                    WHERE doc_type = 'github_repo'
                      AND (filter_owner IS NULL OR LOWER(owner) = LOWER(filter_owner))
                ) sub
                ORDER BY base_name, stars DESC NULLS LAST
            ) deduped
            ORDER BY stars DESC NULLS LAST
            LIMIT match_limit
        ) d
    );
END;
$$;

COMMENT ON FUNCTION private.get_top_repos IS
'Get top GitHub repos by stars. Filters: owner.';

-- ============================================================================
-- 3. COMPARISON - Get specific documents by name (for "X vs Y")
-- ============================================================================

CREATE OR REPLACE FUNCTION private.get_by_names(
    document_names TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB)
        FROM (
            SELECT
                id, name, description, url, doc_type,
                downloads, stars, author, owner, topics
            FROM (
                SELECT DISTINCT ON (base_name, search_name)
                    d.id,
                    regexp_replace(d.name, ' \(part \d+/\d+\)$', '') as name,
                    base_name,
                    d.description, d.url, d.doc_type,
                    d.downloads, d.stars, d.author, d.owner, d.topics,
                    search_name
                FROM (
                    SELECT *,
                        regexp_replace(name, ' \(part \d+/\d+\)$', '') as base_name
                    FROM documents
                ) d
                CROSS JOIN unnest(document_names) AS search_name
                WHERE d.base_name ILIKE '%' || search_name || '%'
                ORDER BY base_name, search_name,
                    CASE
                        WHEN d.doc_type = 'hf_model' THEN d.downloads
                        WHEN d.doc_type = 'github_repo' THEN d.stars
                        ELSE 0
                    END DESC NULLS LAST
            ) deduped
        ) d
    );
END;
$$;

COMMENT ON FUNCTION private.get_by_names IS
'Get documents by name for comparisons. Fuzzy match with ILIKE.';
