interface BadgeProps {
  label: string;
  tone?: "neutral" | "good" | "warning";
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const toneClass =
    tone === "good"
      ? "bg-[color:var(--good-bg)] text-[color:var(--good-ink)]"
      : tone === "warning"
        ? "bg-[color:var(--warn-bg)] text-[color:var(--warn-ink)]"
        : "bg-[color:var(--muted-bg)] text-[color:var(--ink-2)]";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{label}</span>;
}
