"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from "recharts";
import type { ModelCompetitivePosition } from "@/lib/market-analysis";
import { useResponsiveMargin } from "./useResponsiveMargin";
import { useResponsiveYOffset } from "./useResponsiveYOffset";
import { useResponsiveRightMargin } from "./useResponsiveRightMargin";

interface ModelPositionChartProps {
  modelPositions: ModelCompetitivePosition[];
  isTouchDevice: boolean;
}

export function ModelPositionChart({
  modelPositions,
  isTouchDevice,
}: ModelPositionChartProps) {
  const leftMargin = useResponsiveMargin();
  const rightMargin = useResponsiveRightMargin();
  const yOffset = useResponsiveYOffset();

  if (modelPositions.length === 0) {
    return null;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={500}>
        <ScatterChart
          margin={{ top: 20, right: rightMargin, bottom: 60, left: leftMargin }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            type="number"
            dataKey="downloads"
            name="Downloads"
            scale="log"
            domain={["dataMin", "dataMax"]}
            reversed={false}
            tickCount={8}
            stroke="#666666"
            tickFormatter={(value) => {
              if (value >= 1000000) {
                const millions = value / 1000000;
                return millions >= 10
                  ? `${millions.toFixed(0)}M`
                  : `${millions.toFixed(1)}M`;
              }
              return `${(value / 1000).toFixed(0)}K`;
            }}
            label={{
              value: "Downloads (Popularity) →",
              position: "bottom",
              offset: 40,
              style: { fontSize: 12, fill: "#666666" },
            }}
          />
          <YAxis
            type="number"
            dataKey="quality_ratio"
            name="Quality"
            stroke="#666666"
            domain={[0, (dataMax: number) => Math.ceil(dataMax / 10) * 10]}
            label={{
              value: "Quality Score (log-scaled engagement) →",
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
          <ZAxis
            type="number"
            dataKey="likes"
            range={[40, 1200]}
            name="Likes"
          />
          <Tooltip
            content={<ModelPositionTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ pointerEvents: "auto" }}
            allowEscapeViewBox={{ x: true, y: true }}
            animationDuration={0}
            trigger={isTouchDevice ? "click" : "hover"}
          />
          <Scatter data={modelPositions} fill="#222222">
            {modelPositions.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getCategoryColor(entry.category)}
                opacity={0.7}
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: "pointer", touchAction: "auto" }}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border border-stone-border bg-white">
          <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
            Quadrants
          </div>
          <div className="text-xs text-stone font-light space-y-1">
            <div>
              <span className="font-medium">Top-right:</span> Quality Leaders -
              Popular + High engagement
            </div>
            <div>
              <span className="font-medium">Bottom-right:</span> Popular
              Mainstream - Scale without exceptional quality
            </div>
            <div>
              <span className="font-medium">Top-left:</span> Hidden Gems - High
              quality, underrated
            </div>
            <div>
              <span className="font-medium">Bottom-left:</span> Emerging - New
              or struggling
            </div>
          </div>
        </div>
        <div className="p-4 border border-stone-border bg-white">
          <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
            Task Categories
          </div>
          <div className="text-xs text-stone font-light space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3" style={{ backgroundColor: "#2e8b57" }} />
              <span>Embedding</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3" style={{ backgroundColor: "#4682b4" }} />
              <span>Reranking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3" style={{ backgroundColor: "#d2691e" }} />
              <span>Generation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3" style={{ backgroundColor: "#c75b9b" }} />
              <span>Classification</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3" style={{ backgroundColor: "#999999" }} />
              <span>Other</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getCategoryColor(category: string): string {
  if (!category) return "#999999";
  const cat = category.toLowerCase();

  if (
    cat.includes("feature-extraction") ||
    cat.includes("sentence-similarity") ||
    cat.includes("embedding")
  ) {
    return "#2e8b57";
  }
  if (
    cat.includes("rerank") ||
    cat.includes("text-ranking") ||
    cat.includes("cross-encoder")
  ) {
    return "#4682b4";
  }
  if (
    cat.includes("text-generation") ||
    cat.includes("text2text") ||
    cat.includes("summarization") ||
    cat.includes("translation")
  ) {
    return "#d2691e";
  }
  if (cat.includes("question-answering") || cat.includes("qa")) {
    return "#8b4789";
  }
  if (cat.includes("fill-mask") || cat.includes("masked")) {
    return "#c77e3c";
  }
  if (cat.includes("zero-shot") || cat.includes("classification")) {
    return "#c75b9b";
  }
  if (cat.includes("token-classification") || cat.includes("ner")) {
    return "#8fbc8f";
  }
  return "#999999";
}

function ModelPositionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ModelCompetitivePosition }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.model_name}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Category: {data.category}</div>
          <div>Author: {data.author}</div>
          <div>Downloads: {(data.downloads / 1000000).toFixed(1)}M</div>
          <div>Likes: {data.likes.toLocaleString()}</div>
          <div>Quality Score: {data.quality_ratio.toFixed(1)}</div>
          <div>Market Share: {data.market_share.toFixed(1)}%</div>
          <div>Rank: #{data.ranking_position}</div>
        </div>
      </div>
    );
  }
  return null;
}
