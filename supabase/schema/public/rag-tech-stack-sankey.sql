-- Public function for RAG Tech Stack Sankey diagram

CREATE OR REPLACE FUNCTION public.get_rag_tech_stack_sankey()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_rag_tech_stack_sankey_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
