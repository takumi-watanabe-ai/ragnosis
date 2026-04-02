import { ExternalLink } from "lucide-react";
import type { SearchResult } from "@/lib/api";

interface SourceCardProps {
  source: SearchResult;
}

export function SourceCard({ source }: SourceCardProps) {
  const domain = new URL(source.url).hostname;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block py-3 border-b border-stone-border hover:border-charcoal transition-colors group"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-base font-light mb-1 text-charcoal group-hover:opacity-60 transition-opacity">
            {source.metadata.title}
          </div>
          <div className="text-xs text-stone uppercase tracking-wider font-normal">
            {domain}
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-stone flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
}
