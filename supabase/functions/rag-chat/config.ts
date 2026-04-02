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
    // Candidate fetching for reranking
    candidateCount: 50,       // Fetch 60 candidates from each method (120 total for RRF) - increased for better recall

    // Final results to return (regardless of limit param)
    finalResultCount: 20,     // Return top 20 after RRF fusion

    // Boost for structured data (models/repos)
    // With full READMEs, content is balanced but structured data needs edge to compete
    // No boost - let content quality determine ranking
    structuredDataBoost: 1.0,

    // Context sizing (token-optimized)
    context: {
      primaryExcerpt: 400,     // Top 2 sources get full context
      secondaryExcerpt: 150,   // Sources 3-20 get moderate context
      descriptionMax: 150,     // Description truncation
    },
  },

  // Ranking query configuration (for top models/repos queries)
  ranking: {
    candidateCount: 100,      // Fetch top 100 by metric (downloads/stars)
    finalResultCount: 20,     // Rerank to top 20 based on query relevance
  },

  // Feature flags for experimental RAG improvements
  features: {
    // Query planner - intelligent routing to appropriate data sources
    queryPlanner: {
      enabled: true,           // ON - required for ranking queries with reranking
    },

    // Query expansion - generate semantic variations to improve recall
    queryExpansion: {
      enabled: false,          // OFF by default
      maxVariations: 2,        // Number of query variations to generate
    },

    // Answer verification - validate answer claims against sources
    answerVerification: {
      enabled: false,          // OFF by default
      minFaithfulness: 0.7,    // Minimum faithfulness threshold
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
