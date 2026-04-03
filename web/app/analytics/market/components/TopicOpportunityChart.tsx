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
import type { TopicAnalysis } from "@/lib/market-analysis";
import { useResponsiveMargin } from "./useResponsiveMargin";
import { useResponsiveYOffset } from "./useResponsiveYOffset";
import { useResponsiveRightMargin } from "./useResponsiveRightMargin";

interface TopicOpportunityChartProps {
  topics: TopicAnalysis[];
  isTouchDevice: boolean;
}

export function TopicOpportunityChart({
  topics,
  isTouchDevice,
}: TopicOpportunityChartProps) {
  const leftMargin = useResponsiveMargin();
  const rightMargin = useResponsiveRightMargin();
  const yOffset = useResponsiveYOffset();

  if (topics.length === 0) {
    return null;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart
          margin={{ top: 20, right: rightMargin, bottom: 60, left: leftMargin }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            type="number"
            dataKey="repo_count"
            name="Competition"
            stroke="#666666"
            label={{
              value: "Number of Repos (Competition) →",
              position: "bottom",
              offset: 40,
              style: { fontSize: 12, fill: "#666666" },
            }}
          />
          <YAxis
            type="number"
            dataKey="avg_stars"
            name="Avg Success"
            stroke="#666666"
            domain={[0, (dataMax: number) => Math.ceil(dataMax / 10) * 10]}
            tickFormatter={(value) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString()
            }
            label={{
              value: "Avg Stars per Repo →",
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
            dataKey="total_stars"
            range={[50, 1600]}
            name="Market Size"
          />
          <Tooltip
            content={<TopicTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ pointerEvents: "auto" }}
            allowEscapeViewBox={{ x: true, y: true }}
            animationDuration={0}
            trigger={isTouchDevice ? "click" : "hover"}
          />
          <Scatter data={topics} fill="#222222">
            {topics.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getTopicColor(entry, topics)}
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
            Opportunity Score Factors
          </div>
          <div className="text-xs text-stone font-light space-y-1">
            <div>• Market Size (35%): Total stars</div>
            <div>• Low Competition (25%): Fewer repos</div>
            <div>• Avg Success (25%): Stars per repo</div>
            <div>• Low Concentration (15%): Fair distribution</div>
          </div>
        </div>
        <div className="p-4 border border-stone-border bg-white">
          <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
            Color Guide
          </div>
          <div className="text-xs text-stone font-light space-y-1">
            <div>
              •{" "}
              <span style={{ color: "#2e8b57" }} className="font-medium">
                Green
              </span>
              : Low competition + High success = Opportunity
            </div>
            <div>
              •{" "}
              <span style={{ color: "#4682b4" }} className="font-medium">
                Blue
              </span>
              : High competition + High success = Healthy market
            </div>
            <div>
              •{" "}
              <span style={{ color: "#8b0000" }} className="font-medium">
                Red
              </span>
              : High competition + Low success = Saturated
            </div>
            <div>
              •{" "}
              <span style={{ color: "#d2691e" }} className="font-medium">
                Orange
              </span>
              : Low competition + Low success = Emerging/Niche
            </div>
            <div className="pt-1">
              • Bubble size = Market size (total stars)
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function getTopicColor(topic: TopicAnalysis, topics: TopicAnalysis[]): string {
  // Calculate median thresholds from actual data
  const repoCountMedian = topics.map((t) => t.repo_count).sort((a, b) => a - b)[
    Math.floor(topics.length / 2)
  ];
  const avgStarsMedian = topics.map((t) => t.avg_stars).sort((a, b) => a - b)[
    Math.floor(topics.length / 2)
  ];

  const highCompetition = topic.repo_count > repoCountMedian;
  const highSuccess = topic.avg_stars > avgStarsMedian;

  if (!highCompetition && highSuccess) return "#2e8b57"; // Green
  if (highCompetition && highSuccess) return "#4682b4"; // Blue
  if (highCompetition && !highSuccess) return "#8b0000"; // Red
  return "#d2691e"; // Orange
}

function TopicTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TopicAnalysis }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.topic}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Repos: {data.repo_count}</div>
          <div>Market Size: {(data.total_stars / 1000).toFixed(1)}K stars</div>
          <div>Avg per Repo: {data.avg_stars.toFixed(0)} stars</div>
          <div>Median: {data.median_stars} stars</div>
          <div>Top 3 Control: {data.top3_share.toFixed(1)}%</div>
          <div className="pt-1 font-medium">
            Opportunity Score: {data.opportunity_score.toFixed(1)}
          </div>
        </div>
      </div>
    );
  }
  return null;
}
