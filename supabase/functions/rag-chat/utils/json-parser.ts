/**
 * JSON parsing utilities for LLM responses
 * Handles extraction, cleaning, and repair of JSON from LLM outputs
 */

import { PATTERNS } from './constants.ts'

/**
 * Extract JSON from LLM response (handles markdown wrapping)
 */
export function extractJsonFromLLM(content: string): string {
  // Try markdown-wrapped JSON first
  const markdownMatch = content.match(PATTERNS.JSON_MARKDOWN)
  if (markdownMatch) {
    return markdownMatch[1] || markdownMatch[0]
  }

  // Fall back to raw JSON extraction
  const jsonMatch = content.match(PATTERNS.JSON_CONTENT)
  if (jsonMatch) {
    return jsonMatch[1] || jsonMatch[0]
  }

  return content
}

/**
 * Clean JSON string from common LLM issues
 */
export function cleanJsonString(json: string): string {
  let cleaned = json
    // Remove trailing commas before closing braces/brackets
    .replace(PATTERNS.TRAILING_COMMA, '$1')
    // Remove single-line comments
    .replace(PATTERNS.SINGLE_LINE_COMMENT, '')
    // Remove multi-line comments
    .replace(PATTERNS.MULTI_LINE_COMMENT, '')
    // Remove any text before first {
    .replace(PATTERNS.TEXT_BEFORE_JSON, '')
    // Remove any text after last }
    .replace(PATTERNS.TEXT_AFTER_JSON, '')
    .trim()

  return cleaned
}

/**
 * Repair truncated JSON by adding missing closing braces/quotes
 */
export function repairTruncatedJson(json: string): string {
  // Already complete
  if (json.endsWith('}')) {
    return json
  }

  // Count braces
  const openBraces = (json.match(PATTERNS.OPEN_BRACE) || []).length
  const closeBraces = (json.match(PATTERNS.CLOSE_BRACE) || []).length
  const missingBraces = openBraces - closeBraces

  if (missingBraces <= 0) {
    return json
  }

  let repaired = json

  // Check if we're mid-string (odd number of quotes before last quote)
  const lastQuote = repaired.lastIndexOf('"')
  if (lastQuote >= 0) {
    const beforeLastQuote = repaired.substring(0, lastQuote)
    const quoteCount = (beforeLastQuote.match(PATTERNS.QUOTE) || []).length

    if (quoteCount % 2 === 1) {
      // Odd number of quotes - we're in a string, close it
      repaired += '"'
    }
  }

  // Add missing closing braces
  repaired += '}'.repeat(missingBraces)

  return repaired
}

/**
 * Parse JSON from LLM response with full error handling
 */
export function parseJsonFromLLM<T = any>(content: string): T | null {
  try {
    // Step 1: Extract JSON from markdown/text
    let extracted = extractJsonFromLLM(content)

    // Step 2: Clean common issues
    extracted = cleanJsonString(extracted)

    // Step 3: Try to parse
    try {
      return JSON.parse(extracted) as T
    } catch (firstError) {
      // Step 4: Try to repair truncation and parse again
      const repaired = repairTruncatedJson(extracted)
      return JSON.parse(repaired) as T
    }
  } catch (error) {
    console.error('❌ JSON parse failed:', error)
    console.error('📄 Content:', content.substring(0, 500))
    return null
  }
}

/**
 * Safely parse JSON with fallback value
 */
export function parseJsonSafe<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
