-- Public Google Trends analysis functions

-- Get trends time series with cumulative data
CREATE OR REPLACE FUNCTION public.get_trends_time_series()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_trends_time_series_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get aggregated trends over time
CREATE OR REPLACE FUNCTION public.get_aggregated_trends()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_aggregated_trends_internal() t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top trending keywords
CREATE OR REPLACE FUNCTION public.get_top_trending_keywords(
  p_limit INT DEFAULT 10
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM private.get_top_trending_keywords_internal(p_limit) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
