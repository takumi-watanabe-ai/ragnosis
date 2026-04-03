-- Public market structure analysis functions

-- Get language-category matrix
CREATE OR REPLACE FUNCTION public.get_language_category_matrix()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_language_category_matrix_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get author concentration
CREATE OR REPLACE FUNCTION public.get_author_concentration()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_author_concentration_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get task analysis
CREATE OR REPLACE FUNCTION public.get_task_analysis()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_task_analysis_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get model competitive positioning
CREATE OR REPLACE FUNCTION public.get_model_competitive_position()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_model_competitive_position_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get tech stack co-occurrence patterns
CREATE OR REPLACE FUNCTION public.get_tech_stack_patterns()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_tech_stack_patterns_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get topic analysis (repos)
CREATE OR REPLACE FUNCTION public.get_topic_analysis()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_topic_analysis_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

