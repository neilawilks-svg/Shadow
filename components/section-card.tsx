import { PropsWithChildren } from "react";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

export function SectionCard({ title, subtitle, rightSlot, children }: SectionCardProps) {
  return (
    <section className="rounded-3xl border border-white/40 bg-white/75 p-4 shadow-[0_20px_60px_rgba(8,30,62,0.08)] backdrop-blur-xl md:p-6">
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
