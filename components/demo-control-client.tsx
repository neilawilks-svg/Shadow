"use client";

import { useState } from "react";

import { Badge } from "@/components/badge";
import { SectionCard } from "@/components/section-card";

const scenarioPresets = [
  {
    name: "Growth Bet",
    prompt:
      "Agenda: evaluate a new AI-enabled service line launch. Topics: commercialization risk, customer trust, change management.",
  },
  {
    name: "Risk Escalation",
    prompt:
      "Agenda: respond to a major compliance finding. Topics: remediation timeline, reputational impact, stakeholder communication.",
  },
  {
    name: "Portfolio Tradeoff",
    prompt:
      "Agenda: prioritize investment across 3 strategic initiatives. Topics: ROI, capability constraints, sequencing.",
  },
];

export function DemoControlClientPage() {
  const [status, setStatus] = useState("");

  async function runAction(path: string, label: string) {
    const response = await fetch(path, { method: "POST" });
    if (!response.ok) {
      setStatus(`${label} failed`);
      return;
    }
    setStatus(`${label} complete`);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Demo Control Panel"
        subtitle="Scenario presets, state management, and presenter guidance"
        rightSlot={<Badge label="Client-Facing Mode" tone="good" />}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <SectionCard title="State Management" subtitle="Reset and reseed local demo data">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runAction("/api/demo/reset", "Reset")}
                className="rounded-full bg-[color:var(--ink-1)] px-4 py-2 text-sm font-semibold text-white"
              >
                Reset State
              </button>
              <button
                type="button"
                onClick={() => void runAction("/api/demo/seed", "Seed")}
                className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink-2)]"
              >
                Seed Personas
              </button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--ink-3)]">{status || "No actions run yet."}</p>
          </SectionCard>

          <SectionCard title="Scenario Presets" subtitle="Suggested board prompts for consistent storytelling">
            <div className="space-y-2">
              {scenarioPresets.map((scenario) => (
                <article key={scenario.name} className="rounded-xl border border-[color:var(--line)] bg-white p-3">
                  <h3 className="text-sm font-semibold text-[color:var(--ink-1)]">{scenario.name}</h3>
                  <p className="text-xs text-[color:var(--ink-2)]">{scenario.prompt}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="Presenter Notes" subtitle="Keep the narrative aligned to Morgan's value proposition">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[color:var(--ink-2)]">
          <li>Open with governance defaults: consent required, redaction enabled, no raw audio persistence.</li>
          <li>Demonstrate passive listening first, then invited response, then reactive hand raise.</li>
          <li>Show persona interview synthesis as values + decision style capture.</li>
          <li>Run shadow board and compare consensus versus dissent before real board meeting.</li>
          <li>Close on practical adoption path: local-first demo to production hardening.</li>
        </ol>
      </SectionCard>
    </div>
  );
}
