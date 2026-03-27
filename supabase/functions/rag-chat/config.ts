/**
 * Centralized configuration management.
 * Single source of truth for all runtime config.
 */

import CONFIG from '../_shared/config.json' with { type: 'json' }

export const config = {
  // Embedding model configuration
  embedding: {
    model: CONFIG.embedding.model_js,
    dimensions: CONFIG.embedding.dimensions,
  },

  // LLM configuration
  llm: {
    url: Deno.env.get('OLLAMA_URL') || 'http://ragnosis_ollama:11434',
    model: Deno.env.get('OLLAMA_MODEL') || 'qwen2.5:3b-instruct',
    temperature: 0.3,
    maxTokens: 400,  // Target response length
    maxTokensSafetyCeiling: 450,  // Hard limit to allow sentence completion
    stopSequences: ['\n\n\n', 'Question:', 'SOURCES:', '---'],  // Stop at unwanted patterns
  },

  // Database configuration
  database: {
    url: Deno.env.get('DB_URL') || Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey: Deno.env.get('DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  },

  // CORS configuration
  cors: {
    allowOrigin: '*',
    allowHeaders: 'authorization, x-client-info, apikey, content-type',
  }
} as const

// Validation: Ensure required config is present
if (!config.database.url || !config.database.serviceRoleKey) {
  throw new Error('Missing required database configuration')
}
