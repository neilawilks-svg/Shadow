"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { SectionCard } from "@/components/section-card";

interface Persona {
  id: string;
  name: string;
  fixed: boolean;
}

interface RunResult {
  runId: string;
  status: string;
  agenda: string;
  topics: string[];
  consensusSummary: string;
  dissentSummary: string;
  outputs: Array<{
    personaName: string;
    viewpoint: string;
    confidence: number;
  }>;
  recommendations: Array<{
    theme: string;
    recommendation: string;
    confidence: number;
  }>;
}

interface ShadowBoardClientPageProps {
  initialPersonas: Persona[];
}

export function ShadowBoardClientPage({ initialPersonas }: ShadowBoardClientPageProps) {
  const [personas] = useState<Persona[]>(initialPersonas);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(initialPersonas.map((persona) => persona.id));
  const [agenda, setAgenda] = useState("Evaluate expansion strategy for an AI-enabled board advisory offer.");
  const [topics, setTopics] = useState("market positioning, risk controls, operating model, talent readiness");
  const [status, setStatus] = useState("idle");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);

  const topicArray = useMemo(
    () =>
      topics
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [topics],
  );

  const togglePersona = useCallback((id: string) => {
    setSelectedPersonaIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }, []);

  const runShadowBoard = useCallback(async () => {
    setError(null);
    setStatus("running");

    const response = await fetch("/api/shadow-board/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agenda,
        topics: topicArray,
        personaIds: selectedPersonaIds,
      }),
    });

    if (!response.ok) {
      setStatus("failed");
      setError("Unable to start shadow board run.");
      return;
    }

    const payload = (await response.json()) as RunResult;
    setRunResult(payload);
    setStatus(payload.status);

    const reportResponse = await fetch(`/api/shadow-board/runs/${payload.runId}/report`);
    if (reportResponse.ok) {
      const reportPayload = await reportResponse.json();
      setReportMarkdown(reportPayload.markdown);
    }
  }, [agenda, selectedPersonaIds, topicArray]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Virtual Shadow Board"
        subtitle="Simulated pre-meeting debate with 8 fixed personas"
        rightSlot={<Badge label={`${selectedPersonaIds.length}/8 Personas`} tone="good" />}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <SectionCard title="Run Setup" subtitle="Agenda + topics + persona selection">
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Agenda
                <textarea
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  className="min-h-24 rounded-xl border border-[color:var(--line)] bg-white p-3 text-sm text-[color:var(--ink-1)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Topics (comma separated)
                <input
                  value={topics}
                  onChange={(event) => setTopics(event.target.value)}
                  className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[color:var(--ink-1)]"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                {personas.map((persona) => {
                  const selected = selectedPersonaIds.includes(persona.id);
                  return (
                    <button
                      type="button"
                      key={persona.id}
                      onClick={() => togglePersona(persona.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm ${
                        selected
                          ? "border-[color:var(--accent-1)] bg-[color:var(--good-bg)] text-[color:var(--good-ink)]"
                          : "border-[color:var(--line)] bg-white text-[color:var(--ink-2)]"
                      }`}
                    >
                      {persona.name}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void runShadowBoard()}
                disabled={selectedPersonaIds.length === 0}
                className="rounded-full bg-[color:var(--ink-1)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {status === "running" ? "Running..." : "Run Shadow Board"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Outcome" subtitle="Consensus, dissent, and recommendation packet">
            {!runResult ? (
              <p className="text-sm text-[color:var(--ink-3)]">No run yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-[color:var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Consensus</p>
                  <p className="text-sm text-[color:var(--ink-1)]">{runResult.consensusSummary}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--line)] bg-white p-3">
                  <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Dissent</p>
                  <p className="text-sm text-[color:var(--ink-1)]">{runResult.dissentSummary}</p>
                </div>
                <div className="space-y-2">
                  {runResult.recommendations.map((recommendation, index) => (
                    <article key={`${recommendation.theme}-${index}`} className="rounded-xl border border-[color:var(--line)] bg-white p-3">
                      <p className="text-sm font-semibold text-[color:var(--ink-1)]">{recommendation.theme}</p>
                      <p className="text-sm text-[color:var(--ink-2)]">{recommendation.recommendation}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="Shadow Board Report" subtitle="Markdown packet generated for board prep review">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-[color:var(--line)] bg-white p-3 text-xs text-[color:var(--ink-2)]">
          {reportMarkdown || "No report generated yet."}
        </pre>
      </SectionCard>

      <CostPanel />

      {error ? (
        <div className="rounded-2xl border border-[color:var(--warn-ink)] bg-[color:var(--warn-bg)] px-4 py-3 text-sm text-[color:var(--warn-ink)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
