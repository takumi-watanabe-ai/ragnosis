/**
 * Citation utilities for preprocessing and handling inline citations
 */

import type { SearchResult } from "./api";

/**
 * Convert citation markers in text to markdown links for clickable citations
 * Example: "RAG is useful [1][2]" -> "RAG is useful [1](#cite-1)[2](#cite-2)"
 */
export function preprocessCitationMarkers(
  text: string,
  sources: SearchResult[],
): string {
  if (!sources || sources.length === 0) return text;

  // Build a lookup: marker -> actual source marker (for scroll target)
  const markerMap = new Map<string, string>();

  for (const source of sources) {
    if (source.marker) {
      markerMap.set(source.marker, source.marker);
      // Also map the no-bracket variant, e.g. "1" -> "[1]"
      const normalized = source.marker.replace(/[\[\]]/g, "");
      if (normalized !== source.marker) {
        markerMap.set(`[${normalized}]`, source.marker);
      }
    }
  }

  // Expand comma-separated citation groups before the main regex:
  // [1, 2] → [1][2], [1,2,3] → [1][2][3]
  const expanded = text.replace(/\[([^\]]+,[^\]]+)\]/g, (match, inner) => {
    const parts = inner.split(/,\s*/);
    // Check if all parts are numbers
    if (parts.every((p: string) => /^\d+$/.test(p.trim()))) {
      return parts.map((p: string) => `[${p.trim()}]`).join("");
    }
    return match;
  });

  // Match citation patterns: [1], [2], etc.
  return expanded.replace(/\[(\d+)\]/g, (match) => {
    const actual = markerMap.get(match);
    if (actual) {
      const targetInner = actual.replace(/[\[\]]/g, ""); // strip brackets from actual marker
      const displayInner = match.slice(1, -1); // keep original number
      return `[${displayInner}](#cite-${targetInner})`;
    }
    return match;
  });
}

/**
 * Get display title for a source based on its type and metadata
 */
export function getSourceDisplayTitle(source: SearchResult): string {
  if (source.metadata?.title) {
    return source.metadata.title;
  }
  if (source.name) {
    return source.name;
  }
  return "Source";
}

/**
 * Get document type label for display
 */
export function getDocTypeLabel(docType?: string): string {
  switch (docType) {
    case "hf_model":
      return "HuggingFace";
    case "github_repo":
      return "GitHub";
    case "knowledge_base":
      return "Knowledge Base";
    case "google_trend":
      return "Google Trends";
    default:
      return "Source";
  }
}

/**
 * Get badge color for document type
 */
export function getDocTypeBadgeColor(docType?: string): string {
  switch (docType) {
    case "hf_model":
      return "bg-yellow-100 text-yellow-800";
    case "github_repo":
      return "bg-blue-100 text-blue-800";
    case "knowledge_base":
      return "bg-green-100 text-green-800";
    case "google_trend":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-stone-100 text-stone-800";
  }
}
