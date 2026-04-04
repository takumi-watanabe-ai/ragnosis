"use client";

interface TooltipPayload {
  name: string;
  value: number | string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

export function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm">
        {payload.map((entry, index) => (
          <div key={index} className="text-xs text-charcoal mb-1">
            <span className="font-medium">{entry.name}: </span>
            <span className="font-light">
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
