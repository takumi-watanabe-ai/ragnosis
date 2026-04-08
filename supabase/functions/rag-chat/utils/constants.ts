/**
 * Centralized constants for the RAG chat system
 * Eliminates magic numbers and repeated patterns across the codebase
 */

import { config } from '../config.ts'

// ============================================================================
// REGEX PATTERNS
// ============================================================================

export const PATTERNS = {
  // Query classification
  LIST_QUERY: /\b(top|best|popular|trending|list)\b/i,

  // Text cleaning
  PART_SUFFIX: /\s*\(part\s+\d+\/\d+\)\s*$/i,

  // JSON extraction from LLM responses
  JSON_MARKDOWN: /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
  JSON_CONTENT: /(\{[\s\S]*\})/,

  // JSON cleaning
  TRAILING_COMMA: /,(\s*[}\]])/g,
  SINGLE_LINE_COMMENT: /\/\/.*/g,
  MULTI_LINE_COMMENT: /\/\*[\s\S]*?\*\//g,
  TEXT_BEFORE_JSON: /^[^{]*/,
  TEXT_AFTER_JSON: /[^}]*$/,

  // Character matching
  OPEN_BRACE: /\{/g,
  CLOSE_BRACE: /\}/g,
  QUOTE: /"/g,
} as const

// ============================================================================
// THRESHOLDS & LIMITS
// ============================================================================

export const THRESHOLDS = {
  // Answer evaluation (managed via database feature flags)
  // See: services/feature-flags.ts (answer_evaluator config)

  // Search & ranking
  RRF_K: 60,  // Reciprocal Rank Fusion constant
  AUGMENTATION_THRESHOLD: 0.6,  // When to add top models/repos
  MIN_AUGMENTED_COUNT: 10,  // Minimum items to add
  AUGMENTED_INITIAL_SCORE: 0.5,  // Starting score for augmented items
  MAX_TASKS_IN_PROMPT: 15,
  MAX_CROSS_ENCODER_CHARS: 500,

  // Filters
  MIN_STARS_FOR_LANGUAGE: 500,
  MIN_REPOS_FOR_LANGUAGE: 5,

  // LLM configuration
  LLM_RETRY_MAX_ATTEMPTS: 3,
  LLM_RETRY_BASE_WAIT_SECONDS: 5,
  LLM_INSIGHT_CONFIDENCE: 0.8,

  // Evaluation confidence levels (for display only)
  EVAL_CONFIDENCE_HIGH: 85,
  EVAL_CONFIDENCE_MEDIUM: 60,
} as const

// ============================================================================
// WEIGHTS & SCORES
// ============================================================================

export const WEIGHTS = {
  // Doc type defaults (when LLM planner is disabled)
  DEFAULT_DOC_WEIGHTS: {
    knowledge_base: 0.5,
    hf_model: 0.5,
    github_repo: 0.5,
  },

  // RRF fusion (normalized in code using config.search.reranker.fusion weights)
  VECTOR_WEIGHT: 1.0,
  BM25_WEIGHT: 1.0,

  // Answer evaluation scoring weights (sum to 100%)
  EVALUATION: {
    RELEVANCY: 3.5,    // 35% - Most important
    ACCURACY: 3.0,     // 30% - Citations and correctness
    CLARITY: 1.75,     // 17.5% - Structure and readability
    SPECIFICITY: 1.75, // 17.5% - Depth and detail
  },
} as const

// ============================================================================
// RESPONSE FORMATS
// ============================================================================

export const RESPONSE_MESSAGES = {
  NO_QUERY: 'Query is required',
  NO_RESULTS: 'No relevant sources found for your query. Try rephrasing or broadening your question.',
  GENERATION_ERROR: 'Sorry, I encountered an error generating the answer. Please try again.',
  EVALUATION_ERROR: 'Answer evaluation failed',
} as const

// ============================================================================
// LOGGING PREFIXES
// ============================================================================

export const LOG_PREFIX = {
  QUERY: '📥',
  SEARCH: '🔍',
  PLAN: '🎯',
  EXECUTE: '⚡',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  WARN: '⚠️',  // Alias for WARNING
  INFO: 'ℹ️',
  METRICS: '📊',
  RERANK: '🔀',
  FILTER: '🏷️',
  CACHE: '💾',
  LLM: '🤖',
} as const

// ============================================================================
// SEPARATOR STYLES
// ============================================================================

export const SEPARATOR = {
  SECTION: '='.repeat(60),
  SUBSECTION: '-'.repeat(40),
} as const
