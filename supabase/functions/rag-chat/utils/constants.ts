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
  // Answer quality
  MIN_ANSWER_LENGTH: 50,
  MIN_SCORE_FOR_ITERATION: 70,  // Total score threshold
  MIN_ACCURACY: 7,   // Hard requirement: must have citations
  MIN_CLARITY: 7,    // Hard requirement: must have structure
  MIN_FAITHFULNESS: 0.7,
  MAX_ITERATIONS: 3,

  // Search & ranking
  MAX_TASKS_IN_PROMPT: 15,
  MAX_CROSS_ENCODER_CHARS: 500,

  // Filters
  MIN_STARS_FOR_LANGUAGE: 500,
  MIN_REPOS_FOR_LANGUAGE: 5,
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

  // RRF fusion
  VECTOR_WEIGHT: 1.0,
  BM25_WEIGHT: 1.0,
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
