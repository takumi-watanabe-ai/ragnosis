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

  // LLM configuration (cost-optimized)
  llm: {
    url: Deno.env.get('OLLAMA_URL') || 'http://ragnosis_ollama:11434',
    model: Deno.env.get('OLLAMA_MODEL') || 'qwen2.5:3b-instruct',

    // Query planning (minimal tokens for JSON output)
    planning: {
      maxTokens: 150,      // ~100 tokens needed for JSON
      temperature: 0.3,
    },

    // Answer generation (optimized for cost and completeness)
    answer: {
      maxTokens: 500,      // ~350 words, complete but concise
      targetWords: 300,    // Explicit guidance for LLM
      temperature: 0.3,
    },
  },

  // Search and context configuration
  search: {
    // Candidate allocation for vector search
    blogCandidates: 10,           // From blog_docs (larger corpus)
    modelRepoCandidates: 5,       // From ragnosis_docs (models + repos)

    // Context sizing (token-optimized)
    context: {
      primaryExcerpt: 200,     // Top 2 sources get full context
      secondaryExcerpt: 100,   // Sources 3-5 get minimal context
      descriptionMax: 150,     // Model/repo descriptions
    },
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
