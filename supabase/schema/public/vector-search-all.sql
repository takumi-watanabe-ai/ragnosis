-- Public vector search across all docs - validates input and calls private function

DROP FUNCTION IF EXISTS public.vector_search_all_docs(vector, integer);

CREATE OR REPLACE FUNCTION public.vector_search_all_docs(
    query_embedding vector(384),
    match_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    url TEXT,
    doc_type TEXT,
    source TEXT,
    rag_topics TEXT[],
    published_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate inputs
    IF query_embedding IS NULL THEN
        RAISE EXCEPTION 'query_embedding is required';
    END IF;

    IF match_limit < 1 OR match_limit > 100 THEN
        RAISE EXCEPTION 'match_limit must be between 1 and 100';
    END IF;

    -- Call private function
    RETURN QUERY
    SELECT * FROM private.vector_search_all_docs(query_embedding, match_limit);
END;
$$;

COMMENT ON FUNCTION public.vector_search_all_docs IS 'Vector search across ragnosis_docs and blog_docs with input validation';
