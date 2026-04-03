"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AuthorConcentration } from "@/lib/market-analysis";
import { useResponsiveRightMargin } from "./useResponsiveRightMargin";

interface AuthorMarketControlChartProps {
  authors: AuthorConcentration[];
}

export function AuthorMarketControlChart({
  authors,
}: AuthorMarketControlChartProps) {
  const [leftMargin, setLeftMargin] = useState(120);
  const rightMargin = useResponsiveRightMargin();

  useEffect(() => {
    function updateMargin() {
      const width = window.innerWidth;
      // Desktop (>1024px): 120, Tablet (768-1024px): 5, Mobile (<768px): 0
      if (width >= 1024) {
        setLeftMargin(120);
      } else if (width >= 768) {
        setLeftMargin(5);
      } else {
        setLeftMargin(0);
      }
    }

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, []);

  const authorMarketData = authors.slice(0, 10);

  if (authorMarketData.length === 0) {
    return null;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={authorMarketData}
          layout="vertical"
          margin={{ top: 5, right: rightMargin, left: leftMargin, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            type="number"
            stroke="#666666"
            label={{
              value: "Market Share %",
              position: "bottom",
              style: { fontSize: 12, fill: "#666666" },
            }}
          />
          <YAxis
            type="category"
            dataKey="author"
            stroke="#666666"
            tick={{ fontSize: 11 }}
            width={110}
          />
          <Tooltip content={<AuthorTooltip />} />
          <Bar dataKey="market_share" fill="#222222" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-6 p-4 border border-stone-border bg-white">
        <div className="text-xs text-charcoal font-light leading-relaxed">
          <span className="font-medium">Concentration Risk:</span> Top 10
          authors control{" "}
          {authors
            .slice(0, 10)
            .reduce((sum, a) => sum + a.market_share, 0)
            .toFixed(1)}
          % of total downloads. Ecosystem health depends on these key players.
        </div>
      </div>
    </>
  );
}

function AuthorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: AuthorConcentration }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.author}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Models: {data.model_count}</div>
          <div>Downloads: {data.total_downloads.toLocaleString()}</div>
          <div>Market Share: {data.market_share}%</div>
          <div>Categories: {data.categories.join(", ")}</div>
        </div>
      </div>
    );
  }
  return null;
}
