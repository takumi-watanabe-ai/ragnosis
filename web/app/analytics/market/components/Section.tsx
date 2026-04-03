interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Section({ title, subtitle, children }: SectionProps) {
  return (
    <div className="mb-12 border border-stone-border bg-white p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-sm sm:text-base font-normal text-charcoal uppercase tracking-[0.15em] mb-2">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-stone font-light">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
