"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CustomTooltip } from "./CustomTooltip";

interface VerticalBarChartProps<T = Record<string, unknown>> {
  data: T[];
  dataKey: string;
  labelKey: string;
  height?: number;
  barColor?: string;
  barName?: string;
  rotateLabels?: boolean;
}

export function VerticalBarChart<T = Record<string, unknown>>({
  data,
  dataKey,
  labelKey,
  height = 350,
  barColor = "#666666",
  barName,
  rotateLabels = true,
}: VerticalBarChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey={labelKey}
          stroke="#666666"
          angle={rotateLabels ? -45 : 0}
          textAnchor={rotateLabels ? "end" : "middle"}
          height={rotateLabels ? 100 : 30}
        />
        <YAxis stroke="#666666" />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey={dataKey} name={barName} fill={barColor} />
      </BarChart>
    </ResponsiveContainer>
  );
}
