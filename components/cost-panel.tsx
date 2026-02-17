"use client";

import { useEffect, useState } from "react";

import { SectionCard } from "@/components/section-card";

interface UsageSummary {
  totalEstimatedCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: Record<string, number>;
}

export function CostPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const response = await fetch("/api/observability/usage", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as UsageSummary;
      if (mounted) {
        setUsage(payload);
      }
    }

    void run();
    const timer = setInterval(run, 15000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <SectionCard title="Usage + Cost" subtitle="Local debug estimate from runtime calls">
      {!usage ? (
        <p className="text-sm text-[color:var(--ink-3)]">No usage metrics yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Metric title="Estimated Cost" value={`$${usage.totalEstimatedCostUsd.toFixed(4)}`} />
          <Metric title="Input Tokens" value={usage.totalInputTokens.toLocaleString()} />
          <Metric title="Output Tokens" value={usage.totalOutputTokens.toLocaleString()} />
        </div>
      )}
    </SectionCard>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="surface-panel rounded-2xl border border-[color:var(--line)] p-3">
      <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">{title}</p>
      <p className="mt-1 text-lg font-semibold text-[color:var(--ink-1)]">{value}</p>
    </div>
  );
}
