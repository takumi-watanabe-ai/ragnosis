-- Public analytics functions
-- API layer for UI and edge functions

-- Get category distribution
CREATE OR REPLACE FUNCTION public.get_category_distribution()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_category_distribution_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top models
CREATE OR REPLACE FUNCTION public.get_top_models_analytics(
  p_limit INT DEFAULT 10,
  p_task TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Validate limit
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100';
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_top_models_internal(p_limit, p_task) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top repos
CREATE OR REPLACE FUNCTION public.get_top_repos_analytics(
  p_limit INT DEFAULT 10,
  p_language TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Validate limit
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100';
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_top_repos_internal(p_limit, p_language) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get language distribution
CREATE OR REPLACE FUNCTION public.get_language_distribution()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_language_distribution_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get author leaderboard
CREATE OR REPLACE FUNCTION public.get_author_leaderboard(
  p_limit INT DEFAULT 10
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Validate limit
  IF p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 50';
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_author_leaderboard_internal(p_limit) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get ecosystem overview
CREATE OR REPLACE FUNCTION public.get_ecosystem_overview()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_object_agg(metric, value)
  INTO result
  FROM private.get_ecosystem_overview_internal();

  RETURN COALESCE(result, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get popular tags
CREATE OR REPLACE FUNCTION public.get_popular_tags(
  p_limit INT DEFAULT 20
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Validate limit
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100';
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_popular_tags_internal(p_limit) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get popular topics
CREATE OR REPLACE FUNCTION public.get_popular_topics(
  p_limit INT DEFAULT 20
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Validate limit
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Limit must be between 1 and 100';
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_popular_topics_internal(p_limit) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
