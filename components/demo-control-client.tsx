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

interface HealthSnapshot {
  apiKeyConfigured: boolean;
  models: {
    transcribe: string;
    monitor: string;
    personaSynthesis: string;
    shadowBoard: string;
  };
  dataPolicy: {
    persistTranscripts: boolean;
    persistRawAudio: boolean;
    redactionEnabled: boolean;
  };
  checkedAt: string;
}

interface HealthCheckResult {
  label: string;
  status: "ok" | "fail" | "warn";
  detail: string;
}

export function DemoControlClientPage() {
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [checkResults, setCheckResults] = useState<HealthCheckResult[]>([]);
  const [checking, setChecking] = useState(false);

  async function runAction(path: string, label: string) {
    const response = await fetch(path, { method: "POST" });
    if (!response.ok) {
      setStatus(`${label} failed`);
      return;
    }
    setStatus(`${label} complete`);
  }

  async function runHealthChecks() {
    setChecking(true);
    setCheckResults([]);

    const results: HealthCheckResult[] = [];

    try {
      const healthResponse = await fetch("/api/demo/health", { cache: "no-store" });
      if (!healthResponse.ok) {
        results.push({
          label: "Demo Health Route",
          status: "fail",
          detail: `HTTP ${healthResponse.status}`,
        });
      } else {
        const payload = (await healthResponse.json()) as HealthSnapshot;
        setHealth(payload);
        results.push({
          label: "API Key Presence",
          status: payload.apiKeyConfigured ? "ok" : "fail",
          detail: payload.apiKeyConfigured ? "OPENAI_API_KEY configured" : "OPENAI_API_KEY missing",
        });
      }

      const personasResponse = await fetch("/api/personas", { cache: "no-store" });
      results.push({
        label: "Personas Route",
        status: personasResponse.ok ? "ok" : "fail",
        detail: personasResponse.ok ? "reachable" : `HTTP ${personasResponse.status}`,
      });

      const meetingGuardResponse = await fetch("/api/meeting/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "health-check", consentAccepted: false }),
      });
      results.push({
        label: "Meeting Sessions Route",
        status: meetingGuardResponse.status === 400 ? "ok" : "warn",
        detail:
          meetingGuardResponse.status === 400
            ? "reachable (guardrails active)"
            : `unexpected HTTP ${meetingGuardResponse.status}`,
      });

      const shadowGuardResponse = await fetch("/api/shadow-board/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenda: "", topics: [], personaIds: [] }),
      });
      results.push({
        label: "Shadow Board Route",
        status: shadowGuardResponse.status === 400 ? "ok" : "warn",
        detail:
          shadowGuardResponse.status === 400
            ? "reachable (validation active)"
            : `unexpected HTTP ${shadowGuardResponse.status}`,
      });

      const tokenResponse = await fetch("/api/realtime/client-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "transcription" }),
      });

      if (!tokenResponse.ok) {
        results.push({
          label: "Realtime Token Minting",
          status: "fail",
          detail: `HTTP ${tokenResponse.status}`,
        });
      } else {
        const tokenPayload = (await tokenResponse.json()) as { value?: string };
        results.push({
          label: "Realtime Token Minting",
          status: tokenPayload.value ? "ok" : "fail",
          detail: tokenPayload.value ? "ephemeral token minted" : "missing client secret value",
        });
      }
    } catch (error) {
      results.push({
        label: "Diagnostics",
        status: "fail",
        detail: error instanceof Error ? error.message : "Unknown diagnostics error",
      });
    }

    setCheckResults(results);
    setChecking(false);
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
                className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Reset State
              </button>
              <button
                type="button"
                onClick={() => void runAction("/api/demo/seed", "Seed")}
                className="rounded-full border border-[color:var(--line)] bg-[color:var(--field-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--ink-2)]"
              >
                Seed Personas
              </button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--ink-3)]">{status || "No actions run yet."}</p>
          </SectionCard>

          <SectionCard title="Scenario Presets" subtitle="Suggested board prompts for consistent storytelling">
            <div className="space-y-2">
              {scenarioPresets.map((scenario) => (
                <article key={scenario.name} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                  <h3 className="text-sm font-semibold text-[color:var(--ink-1)]">{scenario.name}</h3>
                  <p className="text-xs text-[color:var(--ink-2)]">{scenario.prompt}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard title="Demo Health" subtitle="Checks API key presence, token minting, and core route readiness">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runHealthChecks()}
            className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
            disabled={checking}
          >
            {checking ? "Running checks..." : "Run Health Checks"}
          </button>
          {health ? (
            <span className="text-xs text-[color:var(--ink-3)]">
              Last checked: {new Date(health.checkedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>

        {health ? (
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <article className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3 text-xs text-[color:var(--ink-2)]">
              <p className="font-semibold">Configured Models</p>
              <p>Transcribe: {health.models.transcribe}</p>
              <p>Monitor: {health.models.monitor}</p>
              <p>Persona: {health.models.personaSynthesis}</p>
              <p>Shadow: {health.models.shadowBoard}</p>
            </article>
            <article className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3 text-xs text-[color:var(--ink-2)]">
              <p className="font-semibold">Data Policy</p>
              <p>Persist transcripts: {String(health.dataPolicy.persistTranscripts)}</p>
              <p>Persist raw audio: {String(health.dataPolicy.persistRawAudio)}</p>
              <p>Redaction enabled: {String(health.dataPolicy.redactionEnabled)}</p>
            </article>
          </div>
        ) : null}

        <div className="space-y-2">
          {checkResults.length === 0 ? (
            <p className="text-sm text-[color:var(--ink-3)]">Run checks to view diagnostics.</p>
          ) : (
            checkResults.map((result) => (
              <article
                key={result.label}
                className="flex items-center justify-between rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[color:var(--ink-1)]">{result.label}</p>
                  <p className="text-xs text-[color:var(--ink-3)]">{result.detail}</p>
                </div>
                <Badge
                  label={result.status.toUpperCase()}
                  tone={result.status === "ok" ? "good" : result.status === "warn" ? "warning" : "neutral"}
                />
              </article>
            ))
          )}
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
