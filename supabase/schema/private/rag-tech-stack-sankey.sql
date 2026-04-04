-- Private function for RAG Tech Stack Sankey diagram data
-- Flow: Model Tags -> RAG Categories -> GitHub Topics -> Popularity Tier

DROP FUNCTION IF EXISTS private.get_rag_tech_stack_sankey_internal();

CREATE OR REPLACE FUNCTION private.get_rag_tech_stack_sankey_internal()
RETURNS TABLE (
  source TEXT,
  target TEXT,
  value BIGINT,
  source_type TEXT,
  target_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Step 1: Model Tags -> RAG Categories (weighted by downloads)
  model_tag_to_category AS (
    SELECT
      tag as model_tag,
      category as rag_category,
      m.downloads
    FROM hf_models m
    CROSS JOIN LATERAL UNNEST(m.tags) AS tag
    CROSS JOIN LATERAL UNNEST(m.rag_categories) AS category
    WHERE m.tags IS NOT NULL
      AND m.rag_categories IS NOT NULL
      AND array_length(m.tags, 1) > 0
      AND array_length(m.rag_categories, 1) > 0
      AND m.downloads > 0
  ),
  tag_category_flows AS (
    SELECT
      mtc.model_tag as source,
      mtc.rag_category as target,
      SUM(mtc.downloads)::BIGINT as value,
      'model_tag' as source_type,
      'rag_category' as target_type
    FROM model_tag_to_category mtc
    GROUP BY mtc.model_tag, mtc.rag_category
    HAVING SUM(mtc.downloads) >= 100000  -- Filter low-volume flows
  ),

  -- Step 2: RAG Categories -> GitHub Topics (weighted by stars)
  category_to_topic AS (
    SELECT
      category as rag_category,
      topic as github_topic,
      r.stars
    FROM github_repos r
    CROSS JOIN LATERAL UNNEST(r.rag_categories) AS category
    CROSS JOIN LATERAL UNNEST(r.topics) AS topic
    WHERE r.topics IS NOT NULL
      AND r.rag_categories IS NOT NULL
      AND array_length(r.topics, 1) > 0
      AND array_length(r.rag_categories, 1) > 0
      AND r.stars > 0
  ),
  category_topic_flows AS (
    SELECT
      ctt.rag_category as source,
      ctt.github_topic as target,
      SUM(ctt.stars)::BIGINT as value,
      'rag_category' as source_type,
      'github_topic' as target_type
    FROM category_to_topic ctt
    GROUP BY ctt.rag_category, ctt.github_topic
    HAVING SUM(ctt.stars) >= 100  -- Filter low-star flows
  ),

  -- Step 3: GitHub Topics -> Popularity Tier (based on total stars)
  topic_totals AS (
    SELECT
      topic,
      SUM(r.stars) as total_stars
    FROM github_repos r
    CROSS JOIN LATERAL UNNEST(r.topics) AS topic
    WHERE r.topics IS NOT NULL
      AND array_length(r.topics, 1) > 0
    GROUP BY topic
  ),
  topic_percentiles AS (
    SELECT
      tt.topic,
      tt.total_stars,
      PERCENT_RANK() OVER (ORDER BY tt.total_stars DESC) as percentile
    FROM topic_totals tt
  ),
  topic_tier_flows AS (
    SELECT
      tp.topic as source,
      CASE
        WHEN tp.percentile <= 0.10 THEN 'Top 10%'
        WHEN tp.percentile <= 0.25 THEN 'Top 25%'
        WHEN tp.percentile <= 0.50 THEN 'Top 50%'
        ELSE 'Bottom 50%'
      END as target,
      tp.total_stars as value,
      'github_topic' as source_type,
      'popularity_tier' as target_type
    FROM topic_percentiles tp
  ),

  -- Combine all flows
  all_flows AS (
    SELECT * FROM tag_category_flows
    UNION ALL
    SELECT * FROM category_topic_flows
    UNION ALL
    SELECT * FROM topic_tier_flows
  ),

  -- Get top flows for each stage to avoid clutter
  ranked_flows AS (
    SELECT
      af.*,
      -- For model_tag -> rag_category: global top 50
      CASE
        WHEN af.source_type = 'model_tag' AND af.target_type = 'rag_category' THEN
          ROW_NUMBER() OVER (
            PARTITION BY af.source_type, af.target_type
            ORDER BY af.value DESC
          )
        -- For rag_category -> github_topic: top 5 per category
        WHEN af.source_type = 'rag_category' AND af.target_type = 'github_topic' THEN
          ROW_NUMBER() OVER (
            PARTITION BY af.source
            ORDER BY af.value DESC
          )
        -- For github_topic -> popularity_tier: top 50 globally
        ELSE
          ROW_NUMBER() OVER (
            PARTITION BY af.source_type, af.target_type
            ORDER BY af.value DESC
          )
      END as rank
    FROM all_flows af
  )

  SELECT
    rf.source,
    rf.target,
    rf.value,
    rf.source_type,
    rf.target_type
  FROM ranked_flows rf
  WHERE (
    -- Top 50 for model_tag -> rag_category
    (rf.source_type = 'model_tag' AND rf.target_type = 'rag_category' AND rf.rank <= 50)
    OR
    -- Top 5 per RAG category for rag_category -> github_topic
    (rf.source_type = 'rag_category' AND rf.target_type = 'github_topic' AND rf.rank <= 5)
    OR
    -- Top 50 for github_topic -> popularity_tier
    (rf.source_type = 'github_topic' AND rf.target_type = 'popularity_tier' AND rf.rank <= 50)
  )
  ORDER BY rf.source_type, rf.value DESC;
END;
$$ LANGUAGE plpgsql;
