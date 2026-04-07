"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendsTimeSeries } from "@/lib/trends-analysis";
import { useResponsiveMargin } from "./useResponsiveMargin";
import { useResponsiveYOffset } from "./useResponsiveYOffset";
import { useResponsiveRightMargin } from "./useResponsiveRightMargin";

interface KeywordSummary {
  keyword: string;
  color: string;
  average: number;
  highest: number;
  currentRank: number;
  rankChange: "up" | "down" | "same" | "new";
  currentInterest: number;
}

interface TrendsChartProps {
  trendsData: TrendsTimeSeries[];
  maxTableRows?: number;
}

export function TrendsChart({ trendsData, maxTableRows }: TrendsChartProps) {
  const leftMargin = useResponsiveMargin();
  const rightMargin = useResponsiveRightMargin();
  const yOffset = useResponsiveYOffset();
  const { chartData, keywords, colors, summaries } =
    prepareTrendsChartData(trendsData);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: rightMargin, bottom: 60, left: leftMargin }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="date"
            stroke="#666666"
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            }}
            label={{
              value: "Date →",
              position: "bottom",
              offset: 40,
              style: { fontSize: 12, fill: "#666666" },
            }}
          />
          <YAxis
            stroke="#666666"
            domain={["auto", "auto"]}
            tickFormatter={(value) =>
              value >= 1000000
                ? `${(value / 1000000).toFixed(1)}M`
                : value >= 1000
                  ? `${(value / 1000).toFixed(0)}K`
                  : value.toString()
            }
            label={{
              value: "Search Interest →",
              angle: -90,
              position: "insideLeft",
              offset: yOffset,
              style: {
                fontSize: 12,
                fill: "#666666",
                textAnchor: "middle",
              },
            }}
          />
          <Tooltip
            content={<MultiLineTrendsTooltip />}
            cursor={{ stroke: "#666666", strokeDasharray: "3 3" }}
          />
          {keywords.map((keyword, idx) => (
            <Line
              key={keyword}
              type="monotone"
              dataKey={keyword}
              stroke={colors[idx]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Summary Table */}
      <div className="mt-6 overflow-x-auto border border-stone-border bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-border">
              <th className="text-left p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Rank
              </th>
              <th className="text-left p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Keyword
              </th>
              <th className="text-right p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Current
              </th>
              <th className="text-right p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Average
              </th>
              <th className="text-right p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Peak
              </th>
              <th className="text-center p-3 text-xs text-charcoal uppercase tracking-wide font-medium">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {(maxTableRows ? summaries.slice(0, maxTableRows) : summaries).map(
              (summary) => (
                <tr
                  key={summary.keyword}
                  className="border-b border-stone-border/50 hover:bg-stone-border/10"
                >
                  <td className="p-3 text-xs text-charcoal font-medium">
                    #{summary.currentRank}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 flex-shrink-0"
                        style={{ backgroundColor: summary.color }}
                      />
                      <span className="text-xs text-charcoal font-light">
                        {summary.keyword}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-charcoal font-medium text-right">
                    {summary.currentInterest}
                  </td>
                  <td className="p-3 text-xs text-stone font-light text-right">
                    {summary.average}
                  </td>
                  <td className="p-3 text-xs text-stone font-light text-right">
                    {summary.highest}
                  </td>
                  <td className="p-3 text-center">
                    {summary.rankChange === "up" && (
                      <span className="text-xs text-green-700">↑</span>
                    )}
                    {summary.rankChange === "down" && (
                      <span className="text-xs text-red-700">↓</span>
                    )}
                    {summary.rankChange === "same" && (
                      <span className="text-xs text-stone">−</span>
                    )}
                    {summary.rankChange === "new" && (
                      <span className="text-xs text-blue-700">NEW</span>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 border border-stone-border bg-white">
        <div className="text-xs text-charcoal font-light leading-relaxed space-y-2">
          <p>
            <span className="font-medium">Insight:</span> Rankings based on
            latest search interest. Trend arrows show interest change vs.
            previous period (↑ increased, ↓ decreased, − unchanged).
          </p>
          <p className="text-stone">
            <span className="font-medium">Note:</span> Each keyword is
            normalized to its own 0-100 scale (100 = peak for that keyword).
            Keywords are not directly comparable in absolute search volume.
          </p>
        </div>
      </div>
    </>
  );
}

function prepareTrendsChartData(trendsData: TrendsTimeSeries[]) {
  if (trendsData.length === 0) {
    return { chartData: [], keywords: [], colors: [], summaries: [] };
  }

  const allKeywords = Array.from(new Set(trendsData.map((t) => t.keyword)));
  const dates = Array.from(new Set(trendsData.map((t) => t.date))).sort();
  const latestDate = dates[dates.length - 1];
  const previousDate = dates.length > 1 ? dates[dates.length - 2] : null;

  // Calculate current interest for each keyword to determine ranking
  const keywordInterest = allKeywords.map((keyword) => {
    const currentInterest =
      trendsData.find((t) => t.date === latestDate && t.keyword === keyword)
        ?.interest || 0;
    return { keyword, currentInterest };
  });

  // Sort keywords by current interest (highest first) for color assignment
  const sortedKeywords = keywordInterest
    .sort((a, b) => b.currentInterest - a.currentInterest)
    .map((k) => k.keyword);

  // Color palette sorted by end ranking (#1-#16)
  const colorPalette = [
    "#4682b4", // #1 Steel Blue
    "#8b0000", // #2 Dark Red
    "#2e8b57", // #3 Sea Green
    "#d2691e", // #4 Orange
    "#8b4789", // #5 Purple
    "#b8860b", // #6 Dark Goldenrod
    "#5f9ea0", // #7 Cadet Blue/Teal
    "#c75b9b", // #8 Pale Violet Red/Pink
    "#9acd32", // #9 Yellow Green
    "#9370db", // #10 Medium Purple
    "#bc8f8f", // #11 Rosy Brown
    "#8fbc8f", // #12 Dark Sea Green
    "#cd853f", // #13 Peru/Tan
    "#708090", // #14 Slate Gray
    "#2f4f4f", // #15 Dark Slate Gray
    "#696969", // #16 Dim Gray
  ];

  // Create color mapping based on sorted keywords
  const colorMap = new Map<string, string>();
  sortedKeywords.forEach((keyword, idx) => {
    colorMap.set(keyword, colorPalette[idx % colorPalette.length]);
  });

  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    sortedKeywords.forEach((keyword) => {
      const entry = trendsData.find(
        (t) => t.date === date && t.keyword === keyword,
      );
      row[keyword] = entry?.interest || 0;
    });
    return row;
  });

  const summaries: KeywordSummary[] = sortedKeywords.map((keyword, idx) => {
    const keywordData = trendsData.filter((t) => t.keyword === keyword);
    const interests = keywordData.map((t) => t.interest);
    const average = interests.reduce((a, b) => a + b, 0) / interests.length;
    const highest = Math.max(...interests);
    const currentInterest =
      keywordData.find((t) => t.date === latestDate)?.interest || 0;

    let rankChange: "up" | "down" | "same" | "new" = "same";
    if (previousDate) {
      const prevInterest =
        trendsData.find((t) => t.date === previousDate && t.keyword === keyword)
          ?.interest || 0;

      if (prevInterest === 0) {
        rankChange = "new";
      } else if (currentInterest > prevInterest) {
        rankChange = "up";
      } else if (currentInterest < prevInterest) {
        rankChange = "down";
      }
    }

    return {
      keyword,
      color: colorMap.get(keyword)!,
      average: Math.round(average),
      highest,
      currentInterest,
      currentRank: idx + 1,
      rankChange,
    };
  });

  return {
    chartData,
    keywords: sortedKeywords,
    colors: sortedKeywords.map((k) => colorMap.get(k)!),
    summaries,
  };
}

function MultiLineTrendsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
    payload?: { date?: string };
  }>;
}) {
  if (active && payload && payload.length) {
    const date = payload[0]?.payload?.date;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {date ? new Date(date).toLocaleDateString() : ""}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          {payload
            .filter((p) => p.dataKey !== "date")
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .map((p) => (
              <div
                key={p.dataKey}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-3 h-3 flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="truncate">{p.dataKey}</span>
                </div>
                <span className="font-medium text-charcoal whitespace-nowrap">
                  {(p.value || 0).toLocaleString()}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  }
  return null;
}
