"use client";

import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import type { SearchResult } from "@/lib/api";
import {
  getSourceDisplayTitle,
  getDocTypeBadgeColor,
} from "@/lib/citation-utils";

interface SourceCardProps {
  source: SearchResult;
  messageId?: string;
  highlighted?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function SourceCard({
  source,
  messageId,
  highlighted,
  expanded = false,
  onToggleExpand,
}: SourceCardProps) {
  const domain = source.url ? new URL(source.url).hostname : "";
  const title = getSourceDisplayTitle(source);
  const hasChunkText = source.chunk_text && source.chunk_text.length > 0;
  const badgeColor = getDocTypeBadgeColor(source.doc_type);

  return (
    <div
      id={
        source.marker && messageId
          ? `cite-card-${messageId}-${source.marker.replace(/[\[\]]/g, "")}`
          : undefined
      }
      className={`border-b border-stone-border transition-all ${
        highlighted ? "ring-2 ring-charcoal ring-offset-1 rounded" : ""
      }`}
    >
      <div className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Citation marker and website badge */}
            <div className="flex items-center gap-2 mb-1.5">
              {source.marker && (
                <span className="text-xs font-mono text-stone px-1.5 py-0.5 bg-cream rounded">
                  {source.marker}
                </span>
              )}
              {domain && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded transition-opacity hover:opacity-70 ${badgeColor}`}
                  title={`Visit ${domain}`}
                >
                  {domain}
                </a>
              )}
            </div>

            {/* Title */}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-light text-charcoal hover:opacity-60 transition-opacity block mb-1"
            >
              {title}
            </a>

            {/* Author/Owner */}
            {(source.author || source.owner) && (
              <div className="text-xs text-stone uppercase tracking-wider font-normal mb-2">
                {source.author && <span>Author: {source.author}</span>}
                {source.author && source.owner && <span> • </span>}
                {source.owner && <span>Owner: {source.owner}</span>}
              </div>
            )}

            {/* Metrics */}
            {(source.downloads || source.stars) && (
              <div className="text-xs text-stone font-normal mb-2">
                {source.downloads && (
                  <span className="mr-3">
                    Downloads: {source.downloads.toLocaleString()}
                  </span>
                )}
                {source.stars && (
                  <span>Stars: {source.stars.toLocaleString()}</span>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-stone hover:text-charcoal transition-colors"
              title="Open source"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {hasChunkText && onToggleExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="p-1.5 text-stone hover:text-charcoal transition-colors"
                title={expanded ? "Hide content" : "Show content"}
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanded content - only show when expanded */}
        {expanded && hasChunkText && (
          <div className="mt-3">
            <div className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap bg-cream p-3 rounded">
              {source.chunk_text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
