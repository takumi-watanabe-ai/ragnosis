-- Repository insights: Stack patterns and success analysis

-- Get technology stack patterns (topic co-occurrence)
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
  WITH topic_repos AS (
    SELECT
      r.id as repo_id,
      UNNEST(r.topics) as topic
    FROM github_repos r
    WHERE r.topics IS NOT NULL
      AND array_length(r.topics, 1) > 0
  ),
  topic_pairs AS (
    SELECT
      t1.topic as topic1,
      t2.topic as topic2,
      t1.repo_id
    FROM topic_repos t1
    JOIN topic_repos t2 ON t1.repo_id = t2.repo_id
    WHERE t1.topic < t2.topic  -- Avoid duplicates and self-pairs
  ),
  topic_counts AS (
    SELECT
      topic,
      COUNT(DISTINCT repo_id) as total
    FROM topic_repos
    GROUP BY topic
  )
  SELECT
    tp.topic1,
    tp.topic2,
    COUNT(DISTINCT tp.repo_id) as co_occurrence_count,
    tc1.total as topic1_total,
    tc2.total as topic2_total,
    -- Correlation strength: co-occurrence / (topic1_count + topic2_count - co-occurrence)
    ROUND(
      (COUNT(DISTINCT tp.repo_id)::NUMERIC /
       NULLIF((tc1.total + tc2.total - COUNT(DISTINCT tp.repo_id)), 0)) * 100,
      2
    ) as correlation_strength
  FROM topic_pairs tp
  JOIN topic_counts tc1 ON tp.topic1 = tc1.topic
  JOIN topic_counts tc2 ON tp.topic2 = tc2.topic
  GROUP BY tp.topic1, tp.topic2, tc1.total, tc2.total
  HAVING COUNT(DISTINCT tp.repo_id) >= 3  -- At least 3 repos in common
  ORDER BY co_occurrence_count DESC, correlation_strength DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;


-- Get common technology stacks (grouped topics)
CREATE OR REPLACE FUNCTION private.get_common_tech_stacks_internal()
RETURNS TABLE (
  stack_topics TEXT[],
  repo_count BIGINT,
  avg_stars NUMERIC,
  example_repos TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH repo_topic_sets AS (
    SELECT
      r.id,
      r.repo_name,
      r.stars,
      r.topics
    FROM github_repos r
    WHERE r.topics IS NOT NULL
      AND array_length(r.topics, 1) >= 2
  ),
  stack_groups AS (
    SELECT
      topics as stack,
      COUNT(*) as count,
      ROUND(AVG(stars), 0) as avg_stars,
      ARRAY_AGG(repo_name ORDER BY stars DESC) as repos
    FROM repo_topic_sets
    GROUP BY topics
    HAVING COUNT(*) >= 2
  )
  SELECT
    sg.stack as stack_topics,
    sg.count as repo_count,
    sg.avg_stars,
    sg.repos[1:3] as example_repos
  FROM stack_groups sg
  ORDER BY sg.count DESC, sg.avg_stars DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;
