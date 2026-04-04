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
import type { TaskAnalysis } from "@/lib/market-analysis";
import { useResponsiveMargin } from "./useResponsiveMargin";
import { useResponsiveYOffset } from "./useResponsiveYOffset";
import { useResponsiveRightMargin } from "./useResponsiveRightMargin";

interface TaskOpportunityChartProps {
  tasks: TaskAnalysis[];
  isTouchDevice: boolean;
}

export function TaskOpportunityChart({
  tasks,
  isTouchDevice,
}: TaskOpportunityChartProps) {
  const leftMargin = useResponsiveMargin();
  const rightMargin = useResponsiveRightMargin();
  const yOffset = useResponsiveYOffset();

  if (tasks.length === 0) {
    return null;
  }

  // Calculate appropriate ticks based on data range
  const maxDownloads = Math.max(...tasks.map((t) => t.avg_downloads));
  const yAxisTicks =
    maxDownloads > 5000000
      ? [1000, 10000, 100000, 1000000, 10000000]
      : maxDownloads > 2000000
        ? [1000, 10000, 100000, 1000000, 5000000]
        : [1000, 10000, 100000, 1000000, 3000000];

  return (
    <>
      <ResponsiveContainer width="100%" height={450}>
        <ScatterChart
          margin={{ top: 20, right: rightMargin, bottom: 60, left: leftMargin }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            type="number"
            dataKey="model_count"
            name="Competition"
            stroke="#666666"
            label={{
              value: "Number of Models (Competition) →",
              position: "bottom",
              offset: 40,
              style: { fontSize: 12, fill: "#666666" },
            }}
          />
          <YAxis
            type="number"
            dataKey="avg_downloads"
            name="Avg Success"
            stroke="#666666"
            scale="log"
            domain={["auto", (dataMax: number) => dataMax * 1.5]}
            ticks={yAxisTicks}
            tickFormatter={(value) => {
              if (value >= 1000000) {
                const millions = value / 1000000;
                return millions % 1 === 0
                  ? `${millions.toFixed(0)}M`
                  : `${millions.toFixed(1)}M`;
              }
              if (value >= 1000) {
                return `${(value / 1000).toFixed(0)}K`;
              }
              return value.toString();
            }}
            label={{
              value: "Avg Downloads per Model →",
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
            dataKey="total_downloads"
            range={[100, 3200]}
            name="Market Size"
          />
          <Tooltip
            content={<TaskTooltip />}
            cursor={{ strokeDasharray: "3 3" }}
            wrapperStyle={{ pointerEvents: "auto" }}
            allowEscapeViewBox={{ x: true, y: true }}
            animationDuration={0}
            trigger={isTouchDevice ? "click" : "hover"}
          />
          <Scatter data={tasks} fill="#222222">
            {tasks.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getTaskColor(entry)}
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
            <div>• Market Size (35%): Total downloads</div>
            <div>• Low Competition (25%): Fewer models</div>
            <div>• Avg Success (25%): Downloads per model</div>
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
          </div>
        </div>
      </div>
    </>
  );
}

function getTaskColor(task: TaskAnalysis): string {
  // Dynamic thresholds based on the data
  const highCompetition = task.model_count > 100; // Relaxed from 30
  const highSuccess = task.avg_downloads > 100000; // Relaxed from 500K

  if (!highCompetition && highSuccess) return "#2e8b57"; // Green: Opportunity
  if (highCompetition && highSuccess) return "#4682b4"; // Blue: Healthy
  if (highCompetition && !highSuccess) return "#8b0000"; // Red: Saturated
  return "#d2691e"; // Orange: Emerging
}

function TaskTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TaskAnalysis }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.task}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Models: {data.model_count}</div>
          <div>
            Market Size: {(data.total_downloads / 1000000).toFixed(1)}M
            downloads
          </div>
          <div>Avg per Model: {(data.avg_downloads / 1000).toFixed(0)}K</div>
          <div>Median: {(data.median_downloads / 1000).toFixed(0)}K</div>
          <div>Top 3 Control: {data.top3_share.toFixed(1)}%</div>
          <div
            className="pt-1 font-medium"
            style={{ color: getTaskColor(data) }}
          >
            Opportunity Score: {data.opportunity_score.toFixed(1)}
          </div>
        </div>
      </div>
    );
  }
  return null;
}
