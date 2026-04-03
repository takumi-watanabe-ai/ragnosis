"use client";

import type { TechStackPattern } from "@/lib/market-analysis";

interface TechStackPatternsChartProps {
  stackPatterns: TechStackPattern[];
}

export function TechStackPatternsChart({
  stackPatterns,
}: TechStackPatternsChartProps) {
  if (stackPatterns.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        {stackPatterns.slice(0, 15).map((pattern, idx) => (
          <div
            key={`${pattern.topic1}-${pattern.topic2}`}
            className="flex items-center justify-between p-3 border border-stone-border bg-white"
          >
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xs text-stone font-light">#{idx + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-charcoal font-medium">
                  {pattern.topic1}
                </span>
                <span className="text-stone">+</span>
                <span className="text-sm text-charcoal font-medium">
                  {pattern.topic2}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs text-stone font-light">
              <div>
                <span className="font-medium text-charcoal">
                  {pattern.co_occurrence_count}
                </span>{" "}
                repos
              </div>
              <div>
                <span className="font-medium text-charcoal">
                  {pattern.correlation_strength.toFixed(1)}%
                </span>{" "}
                correlation
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 border border-stone-border bg-white">
        <div className="text-xs text-charcoal font-light leading-relaxed">
          <span className="font-medium">Insight:</span> Most common pairing is{" "}
          <span className="font-medium">
            {stackPatterns[0]?.topic1} + {stackPatterns[0]?.topic2}
          </span>{" "}
          ({stackPatterns[0]?.co_occurrence_count} repos). High correlation =
          technologies that work well together.
        </div>
      </div>
    </>
  );
}
