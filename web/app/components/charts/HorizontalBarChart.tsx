"use client";

import { useEffect, useState } from "react";
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

function formatAxisValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  return value.toString();
}

export function HorizontalBarChart<T = Record<string, unknown>>({
  data,
  dataKey,
  labelKey,
  height = 400,
  barColor = "#222222",
  labelWidth = 140,
}: HorizontalBarChartProps<T>) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const margin = isMobile
    ? { top: 5, right: 5, left: 5, bottom: 5 }
    : { top: 5, right: 30, left: 150, bottom: 5 };

  const CustomYAxisTick = ({
    x,
    y,
    payload,
  }: {
    x: number;
    y: number;
    payload: { value: string };
  }) => {
    const text = payload.value;
    const maxCharsPerLine = isMobile ? 20 : 30;
    const fontSize = isMobile ? 9 : 11;
    const lineHeight = fontSize + 2;

    // Split text into lines (prefer splitting on / or -)
    const lines: string[] = [];
    if (text.length <= maxCharsPerLine) {
      lines.push(text);
    } else {
      // Try to split on / or - for repo/model names
      const parts = text.split(/([\/\-])/);
      let currentLine = "";

      for (const part of parts) {
        if ((currentLine + part).length <= maxCharsPerLine) {
          currentLine += part;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = part;
        }
      }
      if (currentLine) lines.push(currentLine);
    }

    // Center multi-line text vertically
    const totalHeight = lines.length * lineHeight;
    const startY = -(totalHeight / 2) + lineHeight / 2;

    return (
      <g transform={`translate(${x},${y})`}>
        {lines.map((line, index) => (
          <text
            key={index}
            x={0}
            y={startY + index * lineHeight}
            textAnchor="end"
            fill="#666666"
            fontSize={fontSize}
          >
            {line}
          </text>
        ))}
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis type="number" stroke="#666666" tickFormatter={formatAxisValue} />
        <YAxis
          type="category"
          dataKey={labelKey}
          stroke="#666666"
          tick={<CustomYAxisTick />}
          width={isMobile ? 100 : labelWidth}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey={dataKey} fill={barColor} />
      </BarChart>
    </ResponsiveContainer>
  );
}
