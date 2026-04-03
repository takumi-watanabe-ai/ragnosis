-- Private Google Trends analysis functions

-- Get trends time series data with cumulative interest
CREATE OR REPLACE FUNCTION private.get_trends_time_series_internal()
RETURNS TABLE (
  keyword TEXT,
  category TEXT,
  date DATE,
  interest INT,
  cumulative_interest BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH trends_expanded AS (
    SELECT
      gt.keyword,
      gt.category,
      (jsonb_array_elements(gt.time_series)->>'date')::DATE as date,
      (jsonb_array_elements(gt.time_series)->>'value')::INT as interest
    FROM google_trends gt
    WHERE gt.time_series IS NOT NULL
      AND jsonb_array_length(gt.time_series) > 0
  )
  SELECT
    te.keyword,
    te.category,
    te.date,
    te.interest,
    SUM(te.interest) OVER (
      PARTITION BY te.keyword
      ORDER BY te.date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::BIGINT as cumulative_interest
  FROM trends_expanded te
  ORDER BY te.keyword, te.date;
END;
$$ LANGUAGE plpgsql;

-- Get aggregated trends over time (all keywords combined)
CREATE OR REPLACE FUNCTION private.get_aggregated_trends_internal()
RETURNS TABLE (
  date DATE,
  total_interest BIGINT,
  cumulative_interest BIGINT,
  keyword_count INT
) AS $$
BEGIN
  RETURN QUERY
  WITH trends_expanded AS (
    SELECT
      (jsonb_array_elements(gt.time_series)->>'date')::DATE as date,
      (jsonb_array_elements(gt.time_series)->>'value')::INT as interest
    FROM google_trends gt
    WHERE gt.time_series IS NOT NULL
      AND jsonb_array_length(gt.time_series) > 0
  ),
  daily_totals AS (
    SELECT
      te.date,
      SUM(te.interest)::BIGINT as total_interest,
      COUNT(DISTINCT te.date) as keyword_count
    FROM trends_expanded te
    GROUP BY te.date
  )
  SELECT
    dt.date,
    dt.total_interest,
    SUM(dt.total_interest) OVER (
      ORDER BY dt.date
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::BIGINT as cumulative_interest,
    dt.keyword_count::INT
  FROM daily_totals dt
  ORDER BY dt.date;
END;
$$ LANGUAGE plpgsql;

-- Get top trending keywords by current interest
CREATE OR REPLACE FUNCTION private.get_top_trending_keywords_internal(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  keyword TEXT,
  category TEXT,
  current_interest INT,
  avg_interest NUMERIC,
  peak_interest INT,
  trend_direction TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gt.keyword,
    gt.category,
    gt.current_interest,
    gt.avg_interest,
    gt.peak_interest,
    CASE
      WHEN gt.current_interest >= gt.peak_interest * 0.9 THEN 'rising'
      WHEN gt.current_interest <= gt.avg_interest * 0.7 THEN 'declining'
      ELSE 'stable'
    END as trend_direction
  FROM google_trends gt
  WHERE gt.current_interest IS NOT NULL
  ORDER BY gt.current_interest DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
