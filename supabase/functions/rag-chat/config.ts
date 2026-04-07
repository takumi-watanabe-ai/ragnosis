/**
 * Centralized configuration management.
 * Single source of truth for all runtime config.
 */

import CONFIG from "../_shared/config.json" with { type: "json" };

export const config = {
  // Embedding model configuration
  embedding: {
    model: CONFIG.embedding.model_js,
    dimensions: CONFIG.embedding.dimensions,
  },

  // LLM configuration (cost-optimized)
  // Auto-detects provider: OpenRouter if API key exists, else Ollama
  llm: {
    // OpenRouter configuration (production - auto-used if API key exists)
    openrouter: {
      apiKey: Deno.env.get("OPENROUTER_API_KEY"),
      baseUrl: "https://openrouter.ai/api/v1",
      model: Deno.env.get("OPENROUTER_MODEL") || "",
    },

    // Ollama configuration (local development - fallback when no API key)
    ollama: {
      url: Deno.env.get("OLLAMA_URL") || "http://ragnosis_ollama:11434",
      model: Deno.env.get("OLLAMA_MODEL") || "qwen2.5:3b-instruct",
    },

    // Query planning (minimal tokens for JSON output)
    planning: {
      maxTokens: 250, // Increased for complete JSON with reasoning
      temperature: 0.3,
    },

    // Answer generation (optimized for cost and completeness)
    answer: {
      maxTokens: 1000, // ~700 words, enough for comprehensive answers
      targetWords: 500, // Explicit guidance for LLM
      temperature: 0.3,
    },
  },

  // Search and context configuration
  search: {
    // Candidate fetching for reranking
    candidateCount: 50, // Fetch 35 candidates from each method (70 total for RRF) - optimized balance of recall and speed

    // Final results to return (regardless of limit param)
    finalResultCount: 20, // Return top 20 after RRF fusion

    // Multiple chunks per URL (for chunked documents)
    maxChunksPerUrl: 100, // Keep up to 3 relevant chunks per URL

    // Context sizing (token-optimized)
    context: {
      primaryExcerpt: 600, // Top 2 sources get full context
      secondaryExcerpt: 400, // Sources 3-20 get moderate context
      descriptionMax: 300, // Description truncation
    },

    // Reranking config
    reranker: {
      // Cross-encoder config (controlled by 'cross_encoder_reranking' feature flag)
      crossEncoder: {
        maxChars: 500, // Max chars from doc for cross-encoding
        maxCandidates: 50, // Limit candidates to reduce CPU load
      },

      // RRF fusion weights (used in hybrid search merge)
      fusion: {
        vectorWeight: 0.6, // 60% weight for semantic search
        bm25Weight: 0.4, // 40% weight for keyword search (higher due to noun filtering)
      },
    },
  },

  // Ranking query configuration (for top models/repos queries)
  ranking: {
    candidateCount: 100, // Fetch top 100 by metric (downloads/stars)
    finalResultCount: 20, // Rerank to top 20 based on query relevance
  },

  // Feature flags - DEFAULT VALUES ONLY (fallback when DB unavailable)
  // Actual flags are stored in database (see services/feature-flags.ts)
  // These defaults match the initial values in the migration
  features: {
    // LLM Query Planner - weighted multi-source search with doc_type weights
    // When enabled: LLM extracts intent and applies weights to boost relevant doc types
    // When disabled: Simple hybrid search across all doc types (no weights)
    queryPlanner: {
      enabled: true, // Default: OFF
    },

    // Query expansion - generate semantic variations to improve recall
    queryExpansion: {
      enabled: false, // Default: OFF
      maxVariations: 2, // Number of query variations to generate
    },
  },

  // Database configuration
  database: {
    url: Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey:
      Deno.env.get("DB_SERVICE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  },

  // CORS configuration
  cors: {
    allowOrigin: "*",
    allowHeaders: "authorization, x-client-info, apikey, content-type",
  },
} as const;

// Validation: Ensure required config is present
if (!config.database.url || !config.database.serviceRoleKey) {
  throw new Error("Missing required database configuration");
}
