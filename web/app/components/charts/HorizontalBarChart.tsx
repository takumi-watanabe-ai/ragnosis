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

interface HorizontalBarChartProps<T = Record<string, unknown>> {
  data: T[];
  dataKey: string;
  labelKey: string;
  height?: number;
  barColor?: string;
  labelWidth?: number;
}

export function HorizontalBarChart<T = Record<string, unknown>>({
  data,
  dataKey,
  labelKey,
  height = 400,
  barColor = "#222222",
  labelWidth = 140,
}: HorizontalBarChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis type="number" stroke="#666666" />
        <YAxis
          type="category"
          dataKey={labelKey}
          stroke="#666666"
          tick={{ fontSize: 11 }}
          width={labelWidth}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey={dataKey} fill={barColor} />
      </BarChart>
    </ResponsiveContainer>
  );
}
