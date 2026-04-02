-- Private analytics functions
-- Business logic for analysis queries

-- Get task distribution for models
CREATE OR REPLACE FUNCTION private.get_category_distribution_internal()
RETURNS TABLE (
  category TEXT,
  count BIGINT,
  total_downloads BIGINT,
  avg_likes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(task, 'unknown') as category,
    COUNT(*) as count,
    SUM(downloads)::BIGINT as total_downloads,
    ROUND(AVG(likes), 2) as avg_likes
  FROM hf_models
  GROUP BY task
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Get top models with rankings
CREATE OR REPLACE FUNCTION private.get_top_models_internal(
  p_limit INT,
  p_task TEXT DEFAULT NULL
)
RETURNS TABLE (
  model_name TEXT,
  author TEXT,
  downloads BIGINT,
  likes INT,
  task_type TEXT,
  ranking_position INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.model_name,
    m.author,
    m.downloads,
    m.likes,
    m.task as task_type,
    m.ranking_position
  FROM hf_models m
  WHERE
    CASE
      WHEN p_task IS NOT NULL THEN m.task = p_task
      ELSE TRUE
    END
  ORDER BY m.downloads DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get top repos
CREATE OR REPLACE FUNCTION private.get_top_repos_internal(
  p_limit INT,
  p_language TEXT DEFAULT NULL
)
RETURNS TABLE (
  repo_name TEXT,
  owner TEXT,
  stars INT,
  forks INT,
  language TEXT,
  ranking_position INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.repo_name,
    r.owner,
    r.stars,
    r.forks,
    r.language,
    r.ranking_position
  FROM github_repos r
  WHERE
    CASE
      WHEN p_language IS NOT NULL THEN r.language = p_language
      ELSE TRUE
    END
  ORDER BY r.stars DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get language distribution
CREATE OR REPLACE FUNCTION private.get_language_distribution_internal()
RETURNS TABLE (
  language TEXT,
  count BIGINT,
  total_stars BIGINT,
  avg_forks NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(r.language, 'Unknown') as language,
    COUNT(*) as count,
    COALESCE(SUM(r.stars), 0)::BIGINT as total_stars,
    ROUND(AVG(r.forks), 2) as avg_forks
  FROM github_repos r
  GROUP BY r.language
  HAVING COUNT(*) >= 3
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Get author leaderboard
CREATE OR REPLACE FUNCTION private.get_author_leaderboard_internal(
  p_limit INT
)
RETURNS TABLE (
  author TEXT,
  model_count BIGINT,
  total_downloads BIGINT,
  total_likes BIGINT,
  avg_downloads NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.author,
    COUNT(*) as model_count,
    SUM(m.downloads)::BIGINT as total_downloads,
    SUM(m.likes)::BIGINT as total_likes,
    ROUND(AVG(m.downloads), 0) as avg_downloads
  FROM hf_models m
  GROUP BY m.author
  HAVING COUNT(*) >= 2
  ORDER BY total_downloads DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get ecosystem overview stats
CREATE OR REPLACE FUNCTION private.get_ecosystem_overview_internal()
RETURNS TABLE (
  metric TEXT,
  value TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'total_models'::TEXT, COUNT(*)::TEXT FROM hf_models
  UNION ALL
  SELECT 'total_repos'::TEXT, COUNT(*)::TEXT FROM github_repos
  UNION ALL
  SELECT 'total_authors'::TEXT, COUNT(DISTINCT author)::TEXT FROM hf_models
  UNION ALL
  SELECT 'total_owners'::TEXT, COUNT(DISTINCT owner)::TEXT FROM github_repos
  UNION ALL
  SELECT 'total_downloads'::TEXT, SUM(downloads)::TEXT FROM hf_models
  UNION ALL
  SELECT 'total_stars'::TEXT, SUM(stars)::TEXT FROM github_repos
  UNION ALL
  SELECT 'avg_model_downloads'::TEXT, ROUND(AVG(downloads), 0)::TEXT FROM hf_models
  UNION ALL
  SELECT 'avg_repo_stars'::TEXT, ROUND(AVG(stars), 0)::TEXT FROM github_repos;
END;
$$ LANGUAGE plpgsql;

-- Get popular tags across models
CREATE OR REPLACE FUNCTION private.get_popular_tags_internal(
  p_limit INT
)
RETURNS TABLE (
  tag TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    UNNEST(tags) as tag,
    COUNT(*) as count
  FROM hf_models
  WHERE tags IS NOT NULL
  GROUP BY tag
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get popular topics across repos
DROP FUNCTION IF EXISTS private.get_popular_topics_internal(INT);

CREATE OR REPLACE FUNCTION private.get_popular_topics_internal(
  p_limit INT
)
RETURNS TABLE (
  tag TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    UNNEST(topics) as tag,
    COUNT(*) as count
  FROM github_repos
  WHERE topics IS NOT NULL
  GROUP BY tag
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
