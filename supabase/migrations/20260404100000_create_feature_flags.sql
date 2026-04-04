-- Feature flags table for runtime configuration
CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Allow service role to read/write
CREATE POLICY "Service role can manage feature flags"
  ON public.feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read (optional - for admin UI)
CREATE POLICY "Authenticated users can read feature flags"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert default flags from config.ts
INSERT INTO public.feature_flags (flag_name, enabled, config, description) VALUES
  ('query_planner', false, '{"model": "qwen2.5:3b-instruct"}', 'LLM Query Planner - weighted multi-source search with doc_type weights'),
  ('query_expansion', false, '{"max_variations": 2}', 'Generate semantic query variations to improve recall'),
  ('answer_verification', false, '{"min_faithfulness": 0.7}', 'Validate answer claims against sources'),
  ('cross_encoder_reranking', false, '{"max_chars": 500}', 'Use cross-encoder for reranking instead of score fusion'),
  ('response_caching', false, '{"ttl_seconds": 300, "max_size_mb": 50}', 'Enable response caching to reduce LLM calls')
ON CONFLICT (flag_name) DO NOTHING;

-- Function to get all feature flags as JSON
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_object_agg(flag_name, json_build_object(
      'enabled', enabled,
      'config', config
    ))
    FROM public.feature_flags
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get a single feature flag
CREATE OR REPLACE FUNCTION public.get_feature_flag(p_flag_name TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'enabled', enabled,
    'config', config
  )
  INTO result
  FROM public.feature_flags
  WHERE flag_name = p_flag_name;

  RETURN COALESCE(result, json_build_object('enabled', false, 'config', '{}'::json));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update a feature flag
CREATE OR REPLACE FUNCTION public.update_feature_flag(
  p_flag_name TEXT,
  p_enabled BOOLEAN,
  p_config JSONB DEFAULT NULL,
  p_updated_by TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.feature_flags
  SET
    enabled = p_enabled,
    config = COALESCE(p_config, config),
    updated_at = NOW(),
    updated_by = p_updated_by
  WHERE flag_name = p_flag_name;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle a feature flag (convenience function)
CREATE OR REPLACE FUNCTION public.toggle_feature_flag(
  p_flag_name TEXT,
  p_updated_by TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_state BOOLEAN;
BEGIN
  SELECT enabled INTO current_state
  FROM public.feature_flags
  WHERE flag_name = p_flag_name;

  IF current_state IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.feature_flags
  SET
    enabled = NOT current_state,
    updated_at = NOW(),
    updated_by = p_updated_by
  WHERE flag_name = p_flag_name;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON public.feature_flags(enabled);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_flag(TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.update_feature_flag(TEXT, BOOLEAN, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_feature_flag(TEXT, TEXT) TO service_role;
