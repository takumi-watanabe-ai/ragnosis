/**
 * Text formatting and cleaning utilities
 */

import { PATTERNS } from './constants.ts'

/**
 * Remove "(part X/Y)" suffix from document names
 * Used across search results to clean chunked document names
 */
export function cleanPartSuffix(name: string): string {
  return name.replace(PATTERNS.PART_SUFFIX, '').trim()
}

/**
 * Format large numbers with K/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    const millions = num / 1_000_000
    return millions % 1 === 0
      ? `${millions.toFixed(0)}M`
      : `${millions.toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`
  }
  return num.toString()
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength).trim() + '...'
}

/**
 * Create a markdown link
 */
export function markdownLink(text: string, url: string): string {
  return `**[${text}](${url})**`
}
