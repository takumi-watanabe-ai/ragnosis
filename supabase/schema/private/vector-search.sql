-- ============================================================================
-- Private Vector Search - Unified documents table
-- Internal implementation - no validation
-- ============================================================================

-- Drop old signatures
DROP FUNCTION IF EXISTS private.match_documents(vector(384), integer, text);
DROP FUNCTION IF EXISTS private.match_documents(vector(384), integer, text, text[]);

-- Core vector similarity search function
CREATE OR REPLACE FUNCTION private.match_documents(
    query_embedding vector(384),
    match_count INT,
    filter_doc_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    url TEXT,
    doc_type TEXT,
    topics TEXT[],
    similarity FLOAT,
    -- Metrics
    downloads BIGINT,
    stars INT,
    likes INT,
    forks INT,
    ranking_position INT,
    -- Creators
    author TEXT,
    owner TEXT,
    -- Technical
    language TEXT,
    task TEXT,
    -- Content metadata
    published_at TIMESTAMPTZ,
    content_source TEXT,
    -- Tracking
    snapshot_date DATE
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Increase HNSW search effort to return more candidates (default is 40)
    -- Higher ef_search = better recall but slower search
    SET LOCAL hnsw.ef_search = 100;

    RETURN QUERY
    SELECT
        documents.id,
        documents.name,
        documents.description,
        documents.url,
        documents.doc_type,
        documents.topics,
        1 - (documents.embedding <=> query_embedding) AS similarity,
        documents.downloads,
        documents.stars,
        documents.likes,
        documents.forks,
        documents.ranking_position,
        documents.author,
        documents.owner,
        documents.language,
        documents.task,
        documents.published_at,
        documents.content_source,
        documents.snapshot_date
    FROM documents
    WHERE
        (filter_doc_type IS NULL OR documents.doc_type = filter_doc_type)
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION private.match_documents IS 'Core vector similarity search on unified documents table';

-- Drop old signature
DROP FUNCTION IF EXISTS private.search_documents(vector(384), integer, text);

CREATE OR REPLACE FUNCTION private.search_documents(
    query_embedding vector(384),
    match_limit INTEGER,
    filter_doc_type TEXT DEFAULT NULL
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
            'topics', d.topics,
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
    FROM private.match_documents(
        query_embedding,
        match_limit,
        filter_doc_type
    ) d;

    RETURN COALESCE(v_results, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION private.search_documents IS 'Internal vector search on unified documents table';

-- ============================================================================
-- Private Full-Text Search (BM25) - Unified documents table
-- Internal implementation - no validation
-- ============================================================================

-- Drop old signature
DROP FUNCTION IF EXISTS private.text_search_documents(text, integer, text);

CREATE OR REPLACE FUNCTION private.text_search_documents(
    search_query TEXT,
    match_limit INTEGER,
    filter_doc_type TEXT DEFAULT NULL,
    filter_tags TEXT[] DEFAULT NULL,
    filter_nouns TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_results JSONB;
    v_tsquery tsquery;
    v_noun_tsquery tsquery;
BEGIN
    -- Convert AND query to OR query for more flexible matching
    -- websearch_to_tsquery creates 'word1 & word2' but we want 'word1 | word2'
    v_tsquery := REPLACE(websearch_to_tsquery('english', search_query)::text, ' & ', ' | ')::tsquery;

    -- Build noun filter query if nouns provided (OR'd together)
    IF filter_nouns IS NOT NULL AND array_length(filter_nouns, 1) > 0 THEN
        v_noun_tsquery := to_tsquery('english', array_to_string(
            ARRAY(SELECT word || ':*' FROM unnest(filter_nouns) AS word),
            ' | '
        ));
    END IF;

    -- Call text_search_documents function and format results
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'name', d.name,
            'description', d.description,
            'url', d.url,
            'doc_type', d.doc_type,
            'topics', d.topics,
            'rank', d.rank,
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
        ) ORDER BY d.rank DESC
    )
    INTO v_results
    FROM (
        SELECT
            documents.id,
            documents.name,
            documents.description,
            documents.url,
            documents.doc_type,
            documents.topics,
            ts_rank_cd(
                setweight(to_tsvector('english', coalesce(documents.name, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(documents.description, '')), 'B'),
                v_tsquery
            ) AS rank,
            documents.downloads,
            documents.stars,
            documents.likes,
            documents.forks,
            documents.ranking_position,
            documents.author,
            documents.owner,
            documents.language,
            documents.task,
            documents.published_at,
            documents.content_source,
            documents.snapshot_date
        FROM documents
        WHERE
            (
                to_tsvector('english', coalesce(documents.name, '')) ||
                to_tsvector('english', coalesce(documents.description, ''))
            ) @@ v_tsquery
            AND (filter_doc_type IS NULL OR documents.doc_type = filter_doc_type)
            AND (filter_tags IS NULL OR documents.topics && filter_tags)
            AND (
                filter_nouns IS NULL OR
                (
                    to_tsvector('english', coalesce(documents.name, '')) ||
                    to_tsvector('english', coalesce(documents.description, ''))
                ) @@ v_noun_tsquery
            )
        ORDER BY rank DESC
        LIMIT match_limit
    ) d;

    RETURN COALESCE(v_results, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION private.text_search_documents IS 'Internal full-text BM25 search on unified documents table';
