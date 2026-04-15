"use client";

import Image from "next/image";
import type { SearchResult } from "@/lib/api";

interface SourceIconsProps {
  sources: SearchResult[];
  size?: "sm" | "md";
}

// Map domains to their icon filenames
const domainIconMap: Record<string, string> = {
  "huggingface.co": "huggingface.png",
  "github.com": "github.png",
  "llamaindex.ai": "llamaindex-color.png",
  "langchain.com": "langchain.png",
  "anthropic.com": "anthropic.png",
  "trychroma.com": "chroma.png",
  "pinecone.io": "pinecone.png",
  "qdrant.tech": "qdrant.png",
  "weaviate.io": "weaviate.jpeg",
  "ragas.io": "ragas.jpeg",
};

function getIconForDomain(domain: string): string | null {
  // Direct match
  if (domainIconMap[domain]) {
    return domainIconMap[domain];
  }

  // Partial match (e.g., api.github.com -> github.com)
  for (const [key, value] of Object.entries(domainIconMap)) {
    if (domain.includes(key) || key.includes(domain)) {
      return value;
    }
  }

  return null;
}

export function SourceIcons({ sources, size = "sm" }: SourceIconsProps) {
  const iconSize = size === "sm" ? 28 : 32;

  // Get unique domain icons
  const uniqueIcons = Array.from(
    new Set(
      sources
        .map((source) => {
          try {
            const domain = new URL(source.url).hostname;
            return getIconForDomain(domain);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    ),
  ) as string[];

  if (uniqueIcons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center -space-x-0.5">
      {uniqueIcons.map((icon, idx) => (
        <div
          key={idx}
          className="relative rounded-full bg-white border border-stone-border overflow-hidden"
          style={{
            width: iconSize,
            height: iconSize,
            zIndex: uniqueIcons.length - idx,
          }}
        >
          <Image
            src={`/source-icons/${icon}`}
            alt=""
            width={iconSize}
            height={iconSize}
            className="object-contain"
          />
        </div>
      ))}
    </div>
  );
}

interface SourceDomainIconProps {
  url: string;
  size?: "sm" | "md";
}

export function SourceDomainIcon({ url, size = "sm" }: SourceDomainIconProps) {
  const iconSize = size === "sm" ? 24 : 32;

  try {
    const domain = new URL(url).hostname;
    const icon = getIconForDomain(domain);

    if (!icon) {
      return null;
    }

    return (
      <div
        className="relative rounded-full bg-white border border-stone-border overflow-hidden flex-shrink-0"
        style={{ width: iconSize, height: iconSize }}
      >
        <Image
          src={`/source-icons/${icon}`}
          alt=""
          width={iconSize}
          height={iconSize}
          className="object-contain"
        />
      </div>
    );
  } catch {
    return null;
  }
}
