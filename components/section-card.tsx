import { PropsWithChildren } from "react";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function SectionCard({ title, subtitle, rightSlot, children }: SectionCardProps) {
  return (
    <section className="surface-card relative overflow-hidden rounded-3xl border border-[color:var(--line)] p-4 shadow-[var(--card-shadow)] backdrop-blur-xl md:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--accent-1)_0%,var(--accent-3)_52%,var(--accent-2)_100%)]"
      />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--ink-1)] md:text-xl">{title}</h2>
          {subtitle ? <p className="text-sm text-[color:var(--ink-3)]">{subtitle}</p> : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}
