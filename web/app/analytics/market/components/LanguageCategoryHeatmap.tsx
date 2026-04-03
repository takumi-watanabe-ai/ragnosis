"use client";

import { useState, useEffect } from "react";
import type { LanguageCategoryMatrix } from "@/lib/market-analysis";

interface LanguageCategoryHeatmapProps {
  langMatrix: LanguageCategoryMatrix[];
}

export function LanguageCategoryHeatmap({
  langMatrix,
}: LanguageCategoryHeatmapProps) {
  const [boxWidth, setBoxWidth] = useState(140);

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

  const data = prepareLangCategoryHeatmap(langMatrix);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {data.map((lang) => (
          <div key={lang.language} className="mb-4">
            <div className="text-xs text-charcoal uppercase tracking-wide mb-2">
              {lang.language || "Unknown"}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {lang.categories.map((cat) => (
                <div
                  key={cat.name}
                  className="p-3 border border-stone-border text-center flex-shrink-0"
                  style={{
                    width: `${boxWidth}px`,
                    backgroundColor: `rgba(34, 34, 34, ${Math.min(cat.count / 50, 1) * 0.8})`,
                  }}
                >
                  <div
                    className="text-xs uppercase tracking-wide"
                    style={{
                      color: cat.count > 25 ? "#ffffff" : "#222222",
                    }}
                  >
                    {cat.name}
                  </div>
                  <div
                    className="text-xs font-light"
                    style={{
                      color: cat.count > 25 ? "#ffffff" : "#666666",
                    }}
                  >
                    {cat.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function prepareLangCategoryHeatmap(matrix: LanguageCategoryMatrix[]) {
  const categories = Array.from(new Set(matrix.map((m) => m.category)));
  const languages = Array.from(new Set(matrix.map((m) => m.language)));

  const langData = languages.map((lang) => {
    const langCategories = categories
      .map((cat) => {
        const entry = matrix.find(
          (m) => m.language === lang && m.category === cat,
        );
        return {
          name: cat,
          count: entry?.repo_count || 0,
        };
      })
      .filter((cat) => cat.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      language: lang,
      categories: langCategories,
      topCategoryCount: langCategories[0]?.count || 0,
    };
  });

  return langData
    .sort((a, b) => b.topCategoryCount - a.topCategoryCount)
    .map(({ language, categories }) => ({ language, categories }));
}
