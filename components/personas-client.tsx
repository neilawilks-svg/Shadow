"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { SectionCard } from "@/components/section-card";

interface Persona {
  id: string;
  name: string;
  lens: string;
  values: string[];
  riskPosture: "risk_averse" | "balanced" | "risk_tolerant";
  decisionStyle: string;
  challengeStyle: string;
  horizon: "short" | "medium" | "long";
  promptTemplate: string;
  fixed: boolean;
}

interface InterviewSession {
  interviewId: string;
  personaName: string;
  focusArea: string;
  status: "in_progress" | "ready_to_synthesize" | "completed";
  turns: Array<{ question: string; answer: string }>;
  nextQuestion?: string;
  draftProfile?: Partial<Persona>;
}

interface PersonasClientPageProps {
  initialPersonas: Persona[];
}

const PERSONA_PDF_BY_ID: Record<string, string> = {
  "anthony-battle": "/api/persona-pdfs/anthony-battle-executive-persona-profile.pdf",
  "constantin-beier": "/api/persona-pdfs/constantin-beier-executive-persona-profile.pdf",
  "dave-williams": "/api/persona-pdfs/dave-williams-executive-persona-profile.pdf",
  "davi-quintiere": "/api/persona-pdfs/davi-quintiere-executive-persona-profile.pdf",
  "dean-curtis": "/api/persona-pdfs/dean-curtis-executive-persona-profile.pdf",
  "gabi-wagenhofer": "/api/persona-pdfs/gabi-wagenhofer-executive-persona-profile.pdf",
  "karan-khanna": "/api/persona-pdfs/karan-khanna-executive-persona-profile.pdf",
  "marco-van-den-berg": "/api/persona-pdfs/marco-van-den-berg-executive-persona-profile.pdf",
  "morgan-core": "/api/persona-pdfs/morgan-executive-persona-profile.pdf",
  "sophie-bailes": "/api/persona-pdfs/sophie-bailes-executive-persona-profile.pdf",
  "vivek-ganotra": "/api/persona-pdfs/vivek-ganotra-executive-persona-profile.pdf",
};

export function PersonasClientPage({ initialPersonas }: PersonasClientPageProps) {
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
  const [personaName, setPersonaName] = useState("Board Member Candidate");
  const [focusArea, setFocusArea] = useState("Strategic portfolio governance");
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  const refreshPersonas = useCallback(async () => {
    const response = await fetch("/api/personas", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    setPersonas(payload.personas);
  }, []);

  const fixedCount = useMemo(() => personas.filter((persona) => persona.fixed).length, [personas]);

  const startInterview = useCallback(async () => {
    setError(null);
    setStatus("starting");

    const response = await fetch("/api/personas/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaName, focusArea }),
    });

    if (!response.ok) {
      setStatus("failed");
      setError("Unable to start interview.");
      return;
    }

    const payload = await response.json();
    setInterview(payload);
    setStatus("active");
  }, [focusArea, personaName]);

  const submitAnswer = useCallback(async () => {
    if (!interview || !answer.trim()) {
      return;
    }

    const response = await fetch(`/api/personas/interview/${interview.interviewId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });

    if (!response.ok) {
      setError("Unable to process interview answer.");
      return;
    }

    const payload = await response.json();
    setInterview(payload);
    setAnswer("");
  }, [answer, interview]);

  const saveDraftPersona = useCallback(async () => {
    if (!interview?.draftProfile) {
      return;
    }

    const draft = interview.draftProfile;
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name ?? personaName,
        lens: draft.lens ?? focusArea,
        values: draft.values ?? ["clarity", "accountability", "long-term value"],
        riskPosture: draft.riskPosture ?? "balanced",
        decisionStyle: draft.decisionStyle ?? "Structured and evidence-based",
        challengeStyle: draft.challengeStyle ?? "Constructive challenger",
        horizon: draft.horizon ?? "long",
        promptTemplate:
          draft.promptTemplate ??
          "Act as a board member persona focused on strategic clarity, explicit tradeoffs, and pragmatic recommendations.",
      }),
    });

    if (!response.ok) {
      setError("Unable to save persona profile.");
      return;
    }

    setStatus("saved");
    setInterview(null);
    await refreshPersonas();
  }, [focusArea, interview, personaName, refreshPersonas]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Persona Studio"
        subtitle="Guided interview synthesis for values + decision style (not identity imitation)"
        rightSlot={<Badge label={`${fixedCount} Fixed Personas`} tone="good" />}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <SectionCard title="Interview Builder" subtitle="Create a board-member-like persona profile">
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Persona Name
                <input
                  value={personaName}
                  onChange={(event) => setPersonaName(event.target.value)}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                />
              </label>
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Focus Area
                <input
                  value={focusArea}
                  onChange={(event) => setFocusArea(event.target.value)}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void startInterview()}
                className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Start Guided Interview
              </button>
            </div>

            {interview ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <p className="text-xs text-[color:var(--ink-3)]">Status: {interview.status}</p>
                {interview.nextQuestion ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[color:var(--ink-1)]">{interview.nextQuestion}</p>
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      className="min-h-24 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                    />
                    <button
                      type="button"
                      onClick={() => void submitAnswer()}
                      className="mt-2 rounded-full border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-1.5 text-sm text-[color:var(--ink-2)]"
                    >
                      Submit Answer
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-[color:var(--ink-3)]">Interview questions complete. Review and save draft profile.</p>
                )}
              </div>
            ) : null}

            {interview?.draftProfile ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[color:var(--ink-1)]">Draft Profile</p>
                  <button
                    type="button"
                    onClick={() => void saveDraftPersona()}
                    className="btn-accent rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    Save Persona
                  </button>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-[color:var(--ink-2)]">
                  {JSON.stringify(interview.draftProfile, null, 2)}
                </pre>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Persona Library" subtitle="8 fixed personas + saved interview personas">
            <div className="grid gap-3">
              {personas.map((persona) => {
                const pdfLink = PERSONA_PDF_BY_ID[persona.id];
                const card = (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[color:var(--ink-1)]">{persona.name}</h3>
                      <Badge label={persona.fixed ? "Fixed" : "Custom"} tone={persona.fixed ? "neutral" : "good"} />
                    </div>
                    <p className="text-sm text-[color:var(--ink-2)]">{persona.lens}</p>
                    <p className="mt-1 text-xs text-[color:var(--ink-3)]">
                      {persona.decisionStyle} • {persona.challengeStyle}
                    </p>
                    {pdfLink ? (
                      <p className="mt-2 text-xs font-semibold text-[color:var(--accent-ink)]">
                        Open persona PDF in new tab
                      </p>
                    ) : null}
                  </>
                );

                if (!pdfLink) {
                  return (
                    <article key={persona.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                      {card}
                    </article>
                  );
                }

                return (
                  <a
                    key={persona.id}
                    href={pdfLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3 transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]"
                  >
                    {card}
                  </a>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <CostPanel />

      {error ? (
        <div className="rounded-2xl border border-[color:var(--warn-ink)] bg-[color:var(--warn-bg)] px-4 py-3 text-sm text-[color:var(--warn-ink)]">
          {error}
        </div>
      ) : null}

      <p className="text-xs text-[color:var(--ink-3)]">State: {status}</p>
    </div>
  );
}
