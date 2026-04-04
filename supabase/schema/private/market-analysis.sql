-- Private market structure analysis functions

-- Category-based functions now use 'task' field instead of deprecated 'rag_category'

-- Get language-topic matrix
DROP FUNCTION IF EXISTS private.get_language_topic_matrix_internal();
DROP FUNCTION IF EXISTS private.get_language_category_matrix_internal();

CREATE OR REPLACE FUNCTION private.get_language_topic_matrix_internal()
RETURNS TABLE (
  language TEXT,
  topic TEXT,
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
      AND TRIM(r.language) != ''  -- Filter out empty/whitespace languages
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
  -- Aggregate and rank topics per language
  lang_topic_stats AS (
    SELECT
      rt.lang as language,
      rt.topic as topic,
      COUNT(*)::BIGINT as repo_count,
      SUM(rt.stars)::BIGINT as total_stars,
      ROW_NUMBER() OVER (PARTITION BY rt.lang ORDER BY SUM(rt.stars) DESC) as topic_rank
    FROM repo_topics rt
    WHERE LOWER(rt.topic) != LOWER(rt.lang)  -- Don't show "python" as topic for Python language
    GROUP BY rt.lang, rt.topic
  ),
  -- Get language totals for ordering
  lang_totals AS (
    SELECT
      tl.lang,
      tl.total_stars as lang_total_stars
    FROM top_languages tl
  )
  -- Select top 20 topics per language, ordered by language importance
  SELECT
    lts.language,
    lts.topic,
    lts.repo_count,
    lts.total_stars
  FROM lang_topic_stats lts
  JOIN lang_totals lt ON lts.language = lt.lang
  WHERE lts.topic_rank <= 20  -- Limit to top 20 topics per language
  ORDER BY lt.lang_total_stars DESC, lts.topic_rank;
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



-- Get tag distribution and gaps with multi-dimensional analysis
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
  WITH tag_unnested AS (
    SELECT
      UNNEST(m.tags) as tag,
      m.downloads,
      m.model_name
    FROM hf_models m
    WHERE m.tags IS NOT NULL AND array_length(m.tags, 1) > 0
  ),
  tag_stats AS (
    SELECT
      tu.tag,
      COUNT(DISTINCT tu.model_name) as count,
      SUM(tu.downloads)::BIGINT as total_dl,
      AVG(tu.downloads) as avg_dl,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tu.downloads) as median_dl
    FROM tag_unnested tu
    GROUP BY tu.tag
    HAVING COUNT(DISTINCT tu.model_name) >= 5
  ),
  ranked_models AS (
    SELECT DISTINCT ON (tu.tag, tu.model_name)
      tu.tag,
      tu.model_name,
      tu.downloads,
      ROW_NUMBER() OVER (PARTITION BY tu.tag ORDER BY tu.downloads DESC) as rank
    FROM tag_unnested tu
  ),
  tag_concentration AS (
    SELECT
      rm.tag,
      SUM(CASE WHEN rm.rank <= 3 THEN rm.downloads ELSE 0 END)::BIGINT as top3_dl
    FROM ranked_models rm
    GROUP BY rm.tag
  ),
  tag_metrics AS (
    SELECT
      ts.tag,
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
    FROM tag_stats ts
    JOIN tag_concentration tc ON ts.tag = tc.tag
  ),
  normalized_metrics AS (
    SELECT
      tm.tag,
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
    FROM tag_metrics tm
  )
  SELECT
    nm.tag,
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
  WHERE nm.concentration < 95
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
  last_updated TIMESTAMPTZ,
  days_since_update INT,
  ranking_position INT,
  market_share NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH total_downloads AS (
    SELECT SUM(h.downloads)::NUMERIC as total
    FROM hf_models h
  ),
  -- All models with minimum downloads (no time filter to show full age spectrum)
  active_models AS (
    SELECT
      m.model_name,
      m.author,
      COALESCE(m.task, 'other') as category,
      m.downloads,
      m.likes,
      m.last_updated,
      EXTRACT(DAY FROM NOW() - m.last_updated)::INT as days_since_update,
      m.ranking_position
    FROM hf_models m
    WHERE m.downloads >= 1000
      AND m.last_updated IS NOT NULL  -- Only need valid date
  ),
  -- Top 25 per category (ensures all competitive landscapes are shown)
  top_per_category AS (
    SELECT
      am.model_name,
      am.author,
      am.category,
      am.downloads,
      am.likes,
      am.last_updated,
      am.days_since_update,
      am.ranking_position,
      ROW_NUMBER() OVER (PARTITION BY am.category ORDER BY am.downloads DESC) as cat_rank
    FROM active_models am
  ),
  -- Rising stars: new projects (<90 days) with >100K downloads
  rising_stars AS (
    SELECT
      m.model_name,
      m.author,
      COALESCE(m.task, 'other') as category,
      m.downloads,
      m.likes,
      m.last_updated,
      EXTRACT(DAY FROM NOW() - m.last_updated)::INT as days_since_update,
      m.ranking_position
    FROM hf_models m
    WHERE m.downloads >= 100000
      AND m.last_updated IS NOT NULL
      AND m.last_updated >= NOW() - INTERVAL '90 days'
  ),
  -- Combine top per category + rising stars (deduplicated)
  combined AS (
    SELECT
      tpc.model_name, tpc.author, tpc.category, tpc.downloads, tpc.likes,
      tpc.last_updated, tpc.days_since_update, tpc.ranking_position, tpc.cat_rank
    FROM top_per_category tpc
    WHERE tpc.cat_rank <= 25
    UNION
    SELECT
      rs.model_name, rs.author, rs.category, rs.downloads, rs.likes,
      rs.last_updated, rs.days_since_update, rs.ranking_position, 0 as cat_rank
    FROM rising_stars rs
  )
  SELECT DISTINCT ON (c.model_name)
    c.model_name,
    c.author,
    c.category,
    c.downloads,
    c.likes,
    c.last_updated,
    c.days_since_update,
    c.ranking_position,
    CASE
      WHEN t.total > 0
      THEN ROUND((c.downloads::NUMERIC / t.total) * 100, 2)
      ELSE 0
    END as market_share
  FROM combined c
  CROSS JOIN total_downloads t
  ORDER BY c.model_name, c.downloads DESC
  LIMIT 200;  -- Cap at 200 total to prevent chart clutter
END;
$$ LANGUAGE plpgsql;

-- Get repo competitive positioning (stars vs recency)
DROP FUNCTION IF EXISTS private.get_repo_competitive_position_internal();

CREATE OR REPLACE FUNCTION private.get_repo_competitive_position_internal()
RETURNS TABLE (
  repo_name TEXT,
  owner TEXT,
  category TEXT,
  stars INT,
  forks INT,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  months_old INT,
  ranking_position INT,
  market_share NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH total_stars AS (
    SELECT SUM(r.stars)::NUMERIC as total
    FROM github_repos r
  ),
  -- All repos with minimum stars (no time filter to show full age spectrum)
  active_repos AS (
    SELECT
      r.repo_name,
      r.owner,
      COALESCE(
        CASE
          WHEN r.topics IS NOT NULL AND array_length(r.topics, 1) > 0
          THEN r.topics[1]
          ELSE 'other'
        END,
        'other'
      ) as category,
      r.stars,
      r.forks,
      r.updated_at,
      r.created_at,
      ROUND(EXTRACT(EPOCH FROM (NOW() - r.created_at)) / (30.44 * 24 * 3600))::INT as months_old,
      r.ranking_position
    FROM github_repos r
    WHERE r.stars >= 100
      AND r.created_at IS NOT NULL  -- Need valid creation date
  ),
  -- Top 30 per category (power law distribution across all ages)
  top_per_category AS (
    SELECT
      ar.repo_name,
      ar.owner,
      ar.category,
      ar.stars,
      ar.forks,
      ar.updated_at,
      ar.created_at,
      ar.months_old,
      ar.ranking_position,
      ROW_NUMBER() OVER (PARTITION BY ar.category ORDER BY ar.stars DESC) as cat_rank
    FROM active_repos ar
  )
  SELECT
    tpc.repo_name,
    tpc.owner,
    tpc.category,
    tpc.stars,
    tpc.forks,
    tpc.updated_at,
    tpc.created_at,
    tpc.months_old,
    tpc.ranking_position,
    CASE
      WHEN t.total > 0
      THEN ROUND((tpc.stars::NUMERIC / t.total) * 100, 2)
      ELSE 0
    END as market_share
  FROM top_per_category tpc
  CROSS JOIN total_stars t
  WHERE tpc.cat_rank <= 5  -- Top 5 per category
  ORDER BY tpc.stars DESC;
END;
$$ LANGUAGE plpgsql;

-- Get topic opportunity analysis (repos by RAG category)
DROP FUNCTION IF EXISTS private.get_topic_analysis_internal();

CREATE OR REPLACE FUNCTION private.get_topic_analysis_internal()
RETURNS TABLE (
  topic TEXT,
  repo_count BIGINT,
  total_stars BIGINT,
  avg_stars NUMERIC,
  top3_stars BIGINT,
  top3_share NUMERIC,
  median_stars BIGINT,
  opportunity_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH topic_unnested AS (
    SELECT
      UNNEST(r.topics) as topic,
      r.stars,
      r.repo_name
    FROM github_repos r
    WHERE r.topics IS NOT NULL AND array_length(r.topics, 1) > 0
  ),
  topic_stats AS (
    SELECT
      tu.topic,
      COUNT(DISTINCT tu.repo_name) as count,
      SUM(tu.stars)::BIGINT as total_st,
      AVG(tu.stars) as avg_st,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tu.stars) as median_st
    FROM topic_unnested tu
    GROUP BY tu.topic
    HAVING COUNT(DISTINCT tu.repo_name) >= 5
  ),
  ranked_repos AS (
    SELECT DISTINCT ON (tu.topic, tu.repo_name)
      tu.topic,
      tu.repo_name,
      tu.stars,
      ROW_NUMBER() OVER (PARTITION BY tu.topic ORDER BY tu.stars DESC) as rank
    FROM topic_unnested tu
  ),
  topic_concentration AS (
    SELECT
      rr.topic,
      SUM(CASE WHEN rr.rank <= 3 THEN rr.stars ELSE 0 END)::BIGINT as top3_st
    FROM ranked_repos rr
    GROUP BY rr.topic
  ),
  topic_metrics AS (
    SELECT
      ts.topic,
      ts.count as repo_count,
      ts.total_st as total_stars,
      ts.avg_st as avg_stars,
      tc.top3_st as top3_stars,
      ts.median_st as median_stars,
      CASE
        WHEN ts.total_st > 0
        THEN ROUND((tc.top3_st::NUMERIC / ts.total_st) * 100, 2)
        ELSE 0
      END as concentration
    FROM topic_stats ts
    JOIN topic_concentration tc ON ts.topic = tc.topic
  ),
  normalized_metrics AS (
    SELECT
      tm.topic,
      tm.repo_count,
      tm.total_stars,
      tm.avg_stars,
      tm.top3_stars,
      tm.concentration,
      tm.median_stars,
      (tm.total_stars::NUMERIC / NULLIF(MAX(tm.total_stars) OVER (), 0)) as norm_market_size,
      (1.0 - (tm.repo_count::NUMERIC / NULLIF(MAX(tm.repo_count) OVER (), 0))) as norm_low_competition,
      (tm.avg_stars::NUMERIC / NULLIF(MAX(tm.avg_stars) OVER (), 0)) as norm_avg_success,
      (1.0 - (tm.concentration / 100.0)) as norm_low_concentration
    FROM topic_metrics tm
  )
  SELECT
    nm.topic,
    nm.repo_count,
    nm.total_stars,
    ROUND(nm.avg_stars, 0) as avg_stars,
    nm.top3_stars,
    nm.concentration as top3_share,
    nm.median_stars::BIGINT,
    ROUND(
      (
        (nm.norm_market_size * 0.35) +
        (nm.norm_low_competition * 0.25) +
        (nm.norm_avg_success * 0.25) +
        (nm.norm_low_concentration * 0.15)
      ) * 100,
      1
    ) as opportunity_score
  FROM normalized_metrics nm
  WHERE nm.concentration < 95
  ORDER BY nm.total_stars DESC;
END;
$$ LANGUAGE plpgsql;
