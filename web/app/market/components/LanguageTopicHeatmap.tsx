"use client";

import { useState, useEffect } from "react";
import type { LanguageTopicMatrix } from "@/lib/market-analysis";

interface LanguageTopicHeatmapProps {
  langMatrix: LanguageTopicMatrix[];
}

interface TooltipData {
  language: string;
  topic: string;
  repoCount: number;
  totalStars: number;
  percentage: number;
  rank: number;
  x: number;
  y: number;
}

export function LanguageTopicHeatmap({
  langMatrix,
}: LanguageTopicHeatmapProps) {
  const [boxWidth, setBoxWidth] = useState(140);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    function updateWidth() {
      const width = window.innerWidth;
      // Desktop (>1024px): 140px, Tablet (768-1024px): 110px, Mobile (<768px): 90px
      if (width >= 1024) {
        setBoxWidth(140);
      } else if (width >= 768) {
        setBoxWidth(110);
      } else {
        setBoxWidth(90);
      }
    }

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const data = prepareLangTopicHeatmap(langMatrix);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto relative">
      <div className="min-w-max">
        {data.map((lang) => {
          // Calculate max count for this language to normalize opacity (excluding zeros)
          const maxCount = Math.max(
            ...lang.topics.map((t) => t.count).filter((c) => c > 0),
            1,
          );
          const totalRepos = lang.topics.reduce((sum, t) => sum + t.count, 0);

          return (
            <div key={lang.language} className="mb-2">
              <div className="text-xs text-charcoal uppercase tracking-wide mb-2">
                {lang.language || "Unknown"}
              </div>
              <div className="flex gap-2 pb-2">
                {lang.topics.map((topic) => {
                  // For zero counts, use very light background
                  const normalizedIntensity =
                    topic.count === 0
                      ? 0.05
                      : 0.3 + (topic.count / maxCount) * 0.5;

                  const percentage =
                    totalRepos > 0 ? (topic.count / totalRepos) * 100 : 0;

                  // Calculate actual rank within this language
                  const sortedTopics = [...lang.topics]
                    .filter((t) => t.count > 0)
                    .sort((a, b) => b.count - a.count);
                  const actualRank =
                    sortedTopics.findIndex((t) => t.name === topic.name) + 1;

                  return (
                    <div
                      key={topic.name}
                      className="p-3 border border-stone-border text-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        width: `${boxWidth}px`,
                        backgroundColor: `rgba(34, 34, 34, ${normalizedIntensity})`,
                      }}
                      onMouseEnter={(e) => {
                        if (topic.count > 0) {
                          setTooltip({
                            language: lang.language,
                            topic: topic.name,
                            repoCount: topic.count,
                            totalStars: topic.stars,
                            percentage,
                            rank: actualRank,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="text-xs uppercase tracking-wide"
                        style={{
                          color:
                            normalizedIntensity > 0.5 ? "#ffffff" : "#222222",
                        }}
                      >
                        {topic.name}
                      </div>
                      <div
                        className="text-xs font-light"
                        style={{
                          color:
                            normalizedIntensity > 0.5
                              ? "#ffffff"
                              : topic.count === 0
                                ? "#cccccc"
                                : "#666666",
                        }}
                      >
                        {topic.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-stone-border shadow-lg p-3 text-xs max-w-xs"
          style={{
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`,
            pointerEvents: "none",
          }}
        >
          <div className="font-medium text-charcoal mb-2">
            {tooltip.topic} ({tooltip.language})
          </div>
          <div className="space-y-1 text-stone">
            <div>
              <span className="font-medium text-charcoal">Repositories:</span>{" "}
              {tooltip.repoCount.toLocaleString()}
            </div>
            <div>
              <span className="font-medium text-charcoal">Total Stars:</span>{" "}
              {tooltip.totalStars.toLocaleString()}
            </div>
            <div>
              <span className="font-medium text-charcoal">Share:</span>{" "}
              {tooltip.percentage.toFixed(1)}% of {tooltip.language} repos
            </div>
            <div>
              <span className="font-medium text-charcoal">Rank:</span> #
              {tooltip.rank} topic for {tooltip.language}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Normalize topic name to canonical form
function normalizeTopicName(topic: string): string {
  const normalized = topic.toLowerCase().replace(/[-_]/g, "-");

  // Define normalization rules (merge similar topics)
  const rules: Record<string, string> = {
    agent: "agents",
    "ai-agents": "agents",
    "ai-agent": "agents",
    llm: "llms",
    llms: "llms",
    "large-language-models": "llms",
    gpt: "gpt",
    chatgpt: "gpt",
    "gpt-3": "gpt",
    "gpt-4": "gpt",
    "gpt-35-turbo": "gpt",
    rag: "rag",
    "retrieval-augmented-generation": "rag",
    "information-retrieval": "retrieval",
    "semantic-search": "semantic-search",
    search: "search",
    "search-engine": "search",
    "vector-search": "vector-search",
    "hybrid-search": "search",
    "full-text-search": "search",
    "nearest-neighbor-search": "similarity-search",
    "similarity-search": "similarity-search",
  };

  return rules[normalized] || normalized;
}

function prepareLangTopicHeatmap(matrix: LanguageTopicMatrix[]) {
  const languages = Array.from(new Set(matrix.map((m) => m.language)));

  // Normalize and combine topics
  const normalizedMatrix = matrix.map((m) => ({
    ...m,
    topic: normalizeTopicName(m.topic),
  }));

  // Combine counts for normalized topics
  const combinedMatrix: LanguageTopicMatrix[] = [];
  const seen = new Set<string>();

  for (const item of normalizedMatrix) {
    const key = `${item.language}:${item.topic}`;
    if (seen.has(key)) {
      const existing = combinedMatrix.find(
        (m) => m.language === item.language && m.topic === item.topic,
      );
      if (existing) {
        existing.repo_count += item.repo_count;
        existing.total_stars += item.total_stars;
      }
    } else {
      seen.add(key);
      combinedMatrix.push({ ...item });
    }
  }

  // Use Python's topic counts as the reference ordering (since Python is the lead)
  const pythonTopics = combinedMatrix
    .filter((m) => m.language === "Python")
    .sort((a, b) => b.repo_count - a.repo_count)
    .map((m) => m.topic);

  // Add remaining topics not in Python (sorted by global total)
  const allTopics = Array.from(new Set(combinedMatrix.map((m) => m.topic)));
  const remainingTopics = allTopics.filter((t) => !pythonTopics.includes(t));

  const topicTotals = combinedMatrix.reduce(
    (acc, m) => {
      if (remainingTopics.includes(m.topic)) {
        acc[m.topic] = (acc[m.topic] || 0) + m.repo_count;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const sortedRemainingTopics = Object.entries(topicTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  // Python's order first, then remaining topics
  const globalTopicOrder = [...pythonTopics, ...sortedRemainingTopics];

  const langData = languages.map((lang) => {
    // Get topics for this language in Python's reference order
    // Show top 15 topics (including zeros for cross-language comparison)
    const langTopics = globalTopicOrder.slice(0, 15).map((topic) => {
      const entry = combinedMatrix.find(
        (m) => m.language === lang && m.topic === topic,
      );
      return {
        name: topic,
        count: entry?.repo_count || 0,
        stars: entry?.total_stars || 0,
      };
    });

    return {
      language: lang,
      topics: langTopics,
      topTopicCount: Math.max(...langTopics.map((t) => t.count), 0),
    };
  });

  // Custom language order: grouped by language family
  const languageOrder = [
    "Python",
    "Jupyter Notebook",
    "TypeScript",
    "JavaScript",
    "Rust",
    "Go",
    "C++",
    "Java",
  ];

  return langData
    .sort((a, b) => {
      const indexA = languageOrder.indexOf(a.language);
      const indexB = languageOrder.indexOf(b.language);
      // If language is in custom order, use that position
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // If only one is in custom order, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      // Otherwise sort by topic count (fallback for any new languages)
      return b.topTopicCount - a.topTopicCount;
    })
    .map(({ language, topics }) => ({ language, topics }));
}
