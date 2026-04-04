"use client";

interface ChartSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function ChartSection({ title, subtitle, children }: ChartSectionProps) {
  return (
    <div className="mb-12 border border-stone-border bg-white p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-sm sm:text-base font-normal text-charcoal uppercase tracking-[0.15em]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-stone font-light mt-2">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
