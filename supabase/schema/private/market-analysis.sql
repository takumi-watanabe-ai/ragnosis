-- Private market structure analysis functions

-- Category-based functions now use 'task' field instead of deprecated 'rag_category'

-- Get task concentration (replaces category concentration)
DROP FUNCTION IF EXISTS private.get_category_concentration_internal();

CREATE OR REPLACE FUNCTION private.get_category_concentration_internal()
RETURNS TABLE (
  category TEXT,
  total_models BIGINT,
  total_downloads BIGINT,
  top3_downloads BIGINT,
  top3_share NUMERIC,
  top10_share NUMERIC,
  gini_coefficient NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH task_totals AS (
    SELECT
      COALESCE(m.task, 'unknown') as task_name,
      COUNT(*) as count,
      SUM(m.downloads)::BIGINT as total_dl
    FROM hf_models m
    GROUP BY m.task
  ),
  ranked_models AS (
    SELECT
      COALESCE(m.task, 'unknown') as task_name,
      m.downloads,
      ROW_NUMBER() OVER (PARTITION BY m.task ORDER BY m.downloads DESC) as rank
    FROM hf_models m
  ),
  top_downloads AS (
    SELECT
      task_name,
      SUM(CASE WHEN rank <= 3 THEN downloads ELSE 0 END)::BIGINT as top3_dl,
      SUM(CASE WHEN rank <= 10 THEN downloads ELSE 0 END)::BIGINT as top10_dl
    FROM ranked_models
    GROUP BY task_name
  )
  SELECT
    tt.task_name as category,
    tt.count as total_models,
    tt.total_dl as total_downloads,
    td.top3_dl as top3_downloads,
    ROUND((td.top3_dl::NUMERIC / NULLIF(tt.total_dl, 0)) * 100, 2) as top3_share,
    ROUND((td.top10_dl::NUMERIC / NULLIF(tt.total_dl, 0)) * 100, 2) as top10_share,
    0.0 as gini_coefficient  -- Placeholder, complex calculation
  FROM task_totals tt
  JOIN top_downloads td ON tt.task_name = td.task_name
  WHERE tt.count >= 3
  ORDER BY tt.count DESC;
END;
$$ LANGUAGE plpgsql;

-- Get distribution data for a task (replaces category distribution)
DROP FUNCTION IF EXISTS private.get_category_distribution_data_internal(TEXT);

CREATE OR REPLACE FUNCTION private.get_category_distribution_data_internal(
  p_category TEXT
)
RETURNS TABLE (
  model_name TEXT,
  downloads BIGINT,
  percentile NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH task_models AS (
    SELECT
      m.model_name,
      m.downloads,
      PERCENT_RANK() OVER (ORDER BY m.downloads) as pct_rank
    FROM hf_models m
    WHERE COALESCE(m.task, 'unknown') = p_category
  )
  SELECT
    tm.model_name,
    tm.downloads,
    ROUND(tm.pct_rank * 100, 2) as percentile
  FROM task_models tm
  ORDER BY tm.downloads DESC;
END;
$$ LANGUAGE plpgsql;

-- Get language-task matrix (replaces language-category)
DROP FUNCTION IF EXISTS private.get_language_category_matrix_internal();

CREATE OR REPLACE FUNCTION private.get_language_category_matrix_internal()
RETURNS TABLE (
  language TEXT,
  category TEXT,
  repo_count BIGINT,
  total_stars BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Top languages by total stars and repo count
  top_languages AS (
    SELECT
      r.language as lang,
      SUM(r.stars) as total_stars,
      COUNT(*) as repo_count
    FROM github_repos r
    WHERE r.language IS NOT NULL
    GROUP BY r.language
    HAVING SUM(r.stars) >= 500  -- Higher threshold for quality
      AND COUNT(*) >= 5  -- At least 5 repos
    ORDER BY SUM(r.stars) DESC
    LIMIT 8
  ),
  -- All topic-language combinations
  repo_topics AS (
    SELECT
      r.language as lang,
      UNNEST(r.topics) as topic,
      r.stars
    FROM github_repos r
    WHERE r.language IN (SELECT lang FROM top_languages)
      AND r.topics IS NOT NULL
  ),
  -- Aggregate and rank categories per language
  lang_category_stats AS (
    SELECT
      rt.lang as language,
      rt.topic as category,
      COUNT(*)::BIGINT as repo_count,
      SUM(rt.stars)::BIGINT as total_stars,
      ROW_NUMBER() OVER (PARTITION BY rt.lang ORDER BY SUM(rt.stars) DESC) as category_rank
    FROM repo_topics rt
    WHERE LOWER(rt.topic) != LOWER(rt.lang)  -- Don't show "python" as category for Python language
    GROUP BY rt.lang, rt.topic
  ),
  -- Get language totals for ordering
  lang_totals AS (
    SELECT
      tl.lang,
      tl.total_stars as lang_total_stars
    FROM top_languages tl
  )
  -- Select top 8 categories per language, ordered by language importance
  SELECT
    lcs.language,
    lcs.category,
    lcs.repo_count,
    lcs.total_stars
  FROM lang_category_stats lcs
  JOIN lang_totals lt ON lcs.language = lt.lang
  WHERE lcs.category_rank <= 8  -- Limit to top 8 categories per language
  ORDER BY lt.lang_total_stars DESC, lcs.category_rank;
END;
$$ LANGUAGE plpgsql;

-- Get tech stack co-occurrence patterns
DROP FUNCTION IF EXISTS private.get_tech_stack_patterns_internal();

CREATE OR REPLACE FUNCTION private.get_tech_stack_patterns_internal()
RETURNS TABLE (
  topic1 TEXT,
  topic2 TEXT,
  co_occurrence_count BIGINT,
  topic1_total BIGINT,
  topic2_total BIGINT,
  correlation_strength NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH topic_pairs AS (
    SELECT
      t1.topic as topic1,
      t2.topic as topic2
    FROM (
      SELECT DISTINCT UNNEST(topics) as topic
      FROM github_repos
      WHERE topics IS NOT NULL
    ) t1
    CROSS JOIN (
      SELECT DISTINCT UNNEST(topics) as topic
      FROM github_repos
      WHERE topics IS NOT NULL
    ) t2
    WHERE t1.topic < t2.topic  -- Avoid duplicates and self-pairs
  ),
  co_occurrences AS (
    SELECT
      tp.topic1,
      tp.topic2,
      COUNT(*) as co_count
    FROM topic_pairs tp
    JOIN github_repos r ON r.topics @> ARRAY[tp.topic1, tp.topic2]
    GROUP BY tp.topic1, tp.topic2
  ),
  topic_totals AS (
    SELECT
      topic,
      COUNT(*) as total
    FROM (
      SELECT UNNEST(topics) as topic
      FROM github_repos
      WHERE topics IS NOT NULL
    ) unnested
    GROUP BY topic
  )
  SELECT
    co.topic1,
    co.topic2,
    co.co_count::BIGINT as co_occurrence_count,
    tt1.total::BIGINT as topic1_total,
    tt2.total::BIGINT as topic2_total,
    ROUND(
      co.co_count::NUMERIC / NULLIF(LEAST(tt1.total, tt2.total), 0),
      3
    ) as correlation_strength
  FROM co_occurrences co
  JOIN topic_totals tt1 ON co.topic1 = tt1.topic
  JOIN topic_totals tt2 ON co.topic2 = tt2.topic
  WHERE co.co_count >= 3
  ORDER BY correlation_strength DESC, co.co_count DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;


-- Get author concentration
DROP FUNCTION IF EXISTS private.get_author_concentration_internal();

CREATE OR REPLACE FUNCTION private.get_author_concentration_internal()
RETURNS TABLE (
  author TEXT,
  model_count BIGINT,
  total_downloads BIGINT,
  market_share NUMERIC,
  categories TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH author_stats AS (
    SELECT
      m.author,
      COUNT(*) as models,
      SUM(m.downloads)::BIGINT as downloads,
      array_agg(DISTINCT COALESCE(m.task, 'unknown') ORDER BY COALESCE(m.task, 'unknown')) as tasks
    FROM hf_models m
    GROUP BY m.author
  ),
  total AS (
    SELECT SUM(h.downloads)::NUMERIC as total_downloads
    FROM hf_models h
  )
  SELECT
    a.author,
    a.models as model_count,
    a.downloads as total_downloads,
    ROUND((a.downloads::NUMERIC / NULLIF(t.total_downloads, 0)) * 100, 2) as market_share,
    a.tasks as categories
  FROM author_stats a
  CROSS JOIN total t
  ORDER BY a.downloads DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Get task distribution and gaps with multi-dimensional analysis
DROP FUNCTION IF EXISTS private.get_task_analysis_internal();

CREATE OR REPLACE FUNCTION private.get_task_analysis_internal()
RETURNS TABLE (
  task TEXT,
  model_count BIGINT,
  total_downloads BIGINT,
  avg_downloads NUMERIC,
  top3_downloads BIGINT,
  top3_share NUMERIC,
  median_downloads BIGINT,
  opportunity_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH task_stats AS (
    SELECT
      COALESCE(m.task, 'unknown') as task_name,
      COUNT(*) as count,
      SUM(m.downloads)::BIGINT as total_dl,
      AVG(m.downloads) as avg_dl,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.downloads) as median_dl
    FROM hf_models m
    GROUP BY m.task
  ),
  ranked_models AS (
    SELECT
      COALESCE(m.task, 'unknown') as task_name,
      m.downloads,
      ROW_NUMBER() OVER (PARTITION BY m.task ORDER BY m.downloads DESC) as rank
    FROM hf_models m
  ),
  task_concentration AS (
    SELECT
      task_name,
      SUM(CASE WHEN rank <= 3 THEN downloads ELSE 0 END)::BIGINT as top3_dl
    FROM ranked_models
    GROUP BY task_name
  ),
  task_metrics AS (
    SELECT
      ts.task_name,
      ts.count as model_count,
      ts.total_dl as total_downloads,
      ts.avg_dl as avg_downloads,
      tc.top3_dl as top3_downloads,
      ts.median_dl as median_downloads,
      CASE
        WHEN ts.total_dl > 0
        THEN ROUND((tc.top3_dl::NUMERIC / ts.total_dl) * 100, 2)
        ELSE 0
      END as concentration
    FROM task_stats ts
    JOIN task_concentration tc ON ts.task_name = tc.task_name
  ),
  normalized_metrics AS (
    SELECT
      tm.task_name,
      tm.model_count,
      tm.total_downloads,
      tm.avg_downloads,
      tm.top3_downloads,
      tm.concentration,
      tm.median_downloads,
      -- Normalize metrics to 0-1 scale for opportunity score
      (tm.total_downloads::NUMERIC / NULLIF(MAX(tm.total_downloads) OVER (), 0)) as norm_market_size,
      (1.0 - (tm.model_count::NUMERIC / NULLIF(MAX(tm.model_count) OVER (), 0))) as norm_low_competition,
      (tm.avg_downloads::NUMERIC / NULLIF(MAX(tm.avg_downloads) OVER (), 0)) as norm_avg_success,
      (1.0 - (tm.concentration / 100.0)) as norm_low_concentration
    FROM task_metrics tm
  )
  SELECT
    nm.task_name,
    nm.model_count,
    nm.total_downloads,
    ROUND(nm.avg_downloads, 0) as avg_downloads,
    nm.top3_downloads,
    nm.concentration as top3_share,
    nm.median_downloads::BIGINT,
    -- Composite opportunity score (0-100)
    ROUND(
      (
        (nm.norm_market_size * 0.35) +           -- 35% weight: market size
        (nm.norm_low_competition * 0.25) +       -- 25% weight: low competition
        (nm.norm_avg_success * 0.25) +           -- 25% weight: avg success
        (nm.norm_low_concentration * 0.15)       -- 15% weight: low concentration
      ) * 100,
      1
    ) as opportunity_score
  FROM normalized_metrics nm
  ORDER BY nm.total_downloads DESC;
END;
$$ LANGUAGE plpgsql;

-- Get model competitive positioning (downloads vs quality)
DROP FUNCTION IF EXISTS private.get_model_competitive_position_internal();

CREATE OR REPLACE FUNCTION private.get_model_competitive_position_internal()
RETURNS TABLE (
  model_name TEXT,
  author TEXT,
  category TEXT,
  downloads BIGINT,
  likes INT,
  quality_ratio NUMERIC,
  ranking_position INT,
  market_share NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH total_downloads AS (
    SELECT SUM(h.downloads)::NUMERIC as total
    FROM hf_models h
  )
  SELECT
    m.model_name,
    m.author,
    COALESCE(m.task, 'other') as category,
    m.downloads,
    m.likes,
    CASE
      WHEN m.downloads > 0 AND m.likes > 0
      THEN ROUND(LN(m.likes::NUMERIC + 1) / LN(m.downloads::NUMERIC + 1) * 100, 2)
      ELSE 0
    END as quality_ratio,
    m.ranking_position,
    CASE
      WHEN t.total > 0
      THEN ROUND((m.downloads::NUMERIC / t.total) * 100, 2)
      ELSE 0
    END as market_share
  FROM hf_models m
  CROSS JOIN total_downloads t
  WHERE m.downloads >= 1000  -- Filter out very low download models
  ORDER BY m.downloads DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Get repos language concentration
DROP FUNCTION IF EXISTS private.get_repo_language_concentration_internal();

CREATE OR REPLACE FUNCTION private.get_repo_language_concentration_internal()
RETURNS TABLE (
  language TEXT,
  total_repos BIGINT,
  total_stars BIGINT,
  top3_stars BIGINT,
  top3_share NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH language_totals AS (
    SELECT
      COALESCE(r.language, 'Unknown') as lang,
      COUNT(*) as total,
      SUM(r.stars) as total_st
    FROM github_repos r
    GROUP BY r.language
    HAVING COUNT(*) >= 3
  ),
  top_repos AS (
    SELECT
      COALESCE(r.language, 'Unknown') as lang,
      r.stars,
      ROW_NUMBER() OVER (PARTITION BY r.language ORDER BY r.stars DESC) as rank
    FROM github_repos r
  ),
  concentration AS (
    SELECT
      tr.lang,
      SUM(CASE WHEN tr.rank <= 3 THEN tr.stars ELSE 0 END) as top3_st
    FROM top_repos tr
    GROUP BY tr.lang
  )
  SELECT
    lt.lang,
    lt.total as total_repos,
    lt.total_st::BIGINT as total_stars,
    c.top3_st::BIGINT as top3_stars,
    ROUND((c.top3_st::NUMERIC / NULLIF(lt.total_st, 0)) * 100, 2) as top3_share
  FROM language_totals lt
  JOIN concentration c ON lt.lang = c.lang
  ORDER BY lt.total_st DESC;
END;
$$ LANGUAGE plpgsql;
