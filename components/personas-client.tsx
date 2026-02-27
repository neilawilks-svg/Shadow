"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { SectionCard } from "@/components/section-card";

interface Persona {
  id: string;
  name: string;
  role: "board_member" | "slalom_facilitator";
  lens: string;
  values: string[];
  riskPosture: "risk_averse" | "balanced" | "risk_tolerant";
  decisionStyle: string;
  challengeStyle: string;
  horizon: "short" | "medium" | "long";
  promptTemplate: string;
  personaPdfUrl?: string;
  personaPdfFileName?: string;
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

export function PersonasClientPage({ initialPersonas }: PersonasClientPageProps) {
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
  const [personaName, setPersonaName] = useState("Board Member Candidate");
  const [personaRole, setPersonaRole] = useState<Persona["role"]>("board_member");
  const [focusArea, setFocusArea] = useState("Strategic portfolio governance");
  const [personaPdfUrl, setPersonaPdfUrl] = useState<string>("");
  const [personaPdfFileName, setPersonaPdfFileName] = useState<string>("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
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
  const boardMemberCount = useMemo(
    () => personas.filter((persona) => persona.role === "board_member").length,
    [personas],
  );
  const facilitatorCount = useMemo(
    () => personas.filter((persona) => persona.role === "slalom_facilitator").length,
    [personas],
  );

  const uploadPersonaPdf = useCallback(async (file: File) => {
    setError(null);
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("personaId", personaName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const response = await fetch("/api/personas/pdf-upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        setError("Unable to upload persona PDF.");
        return;
      }
      const payload = (await response.json()) as { url?: string; fileName?: string };
      setPersonaPdfUrl(payload.url ?? "");
      setPersonaPdfFileName(payload.fileName ?? file.name);
    } catch {
      setError("Unable to upload persona PDF.");
    } finally {
      setUploadingPdf(false);
    }
  }, [personaName]);

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
        role: personaRole,
        lens: draft.lens ?? focusArea,
        values: draft.values ?? ["clarity", "accountability", "long-term value"],
        riskPosture: draft.riskPosture ?? "balanced",
        decisionStyle: draft.decisionStyle ?? "Structured and evidence-based",
        challengeStyle: draft.challengeStyle ?? "Constructive challenger",
        horizon: draft.horizon ?? "long",
        promptTemplate:
          draft.promptTemplate ??
          "Act as a board member persona focused on strategic clarity, explicit tradeoffs, and pragmatic recommendations.",
        personaPdfUrl: personaPdfUrl || undefined,
        personaPdfFileName: personaPdfFileName || undefined,
      }),
    });

    if (!response.ok) {
      setError("Unable to save persona profile.");
      return;
    }

    setStatus("saved");
    setInterview(null);
    setPersonaPdfUrl("");
    setPersonaPdfFileName("");
    await refreshPersonas();
  }, [focusArea, interview, personaName, personaPdfFileName, personaPdfUrl, personaRole, refreshPersonas]);

  const quickAddPersona = useCallback(async () => {
    setError(null);
    setStatus("saving");
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: personaName,
        role: personaRole,
        lens: focusArea,
        values: ["clarity", "accountability", "long-term value"],
        riskPosture: "balanced",
        decisionStyle: "Structured and evidence-based",
        challengeStyle: "Constructive challenger",
        horizon: "long",
        promptTemplate:
          "Act as a board member persona focused on strategic clarity, explicit tradeoffs, and pragmatic recommendations.",
        personaPdfUrl: personaPdfUrl || undefined,
        personaPdfFileName: personaPdfFileName || undefined,
      }),
    });

    if (!response.ok) {
      setStatus("failed");
      setError("Unable to save persona profile.");
      return;
    }
    setStatus("saved");
    setPersonaName("Board Member Candidate");
    setFocusArea("Strategic portfolio governance");
    setPersonaRole("board_member");
    setPersonaPdfUrl("");
    setPersonaPdfFileName("");
    await refreshPersonas();
  }, [focusArea, personaName, personaPdfFileName, personaPdfUrl, personaRole, refreshPersonas]);

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
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Role
                <select
                  value={personaRole}
                  onChange={(event) => setPersonaRole(event.target.value as Persona["role"])}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                >
                  <option value="board_member">Board Member</option>
                  <option value="slalom_facilitator">Slalom Facilitator</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Persona PDF
                <div className="flex items-center gap-2">
                  <label className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-2 text-sm text-[color:var(--ink-2)]">
                    {uploadingPdf ? "Uploading..." : "Upload PDF"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadPersonaPdf(file);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {personaPdfFileName ? (
                    <span className="text-xs text-[color:var(--ink-3)]">{personaPdfFileName}</span>
                  ) : (
                    <span className="text-xs text-[color:var(--ink-3)]">No PDF attached</span>
                  )}
                </div>
              </label>
              <button
                type="button"
                onClick={() => void startInterview()}
                className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Start Guided Interview
              </button>
              <button
                type="button"
                onClick={() => void quickAddPersona()}
                className="rounded-full border border-[color:var(--line)] bg-[color:var(--field-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--ink-2)]"
              >
                Add Persona Without Interview
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

          <SectionCard
            title="Persona Library"
            subtitle={`${fixedCount} fixed + ${personas.length - fixedCount} custom | ${boardMemberCount} board members, ${facilitatorCount} facilitators`}
          >
            <div className="grid gap-3">
              {personas.map((persona) => {
                const pdfLink = persona.personaPdfUrl;
                const card = (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[color:var(--ink-1)]">{persona.name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge label={persona.role === "board_member" ? "Board Member" : "Slalom Facilitator"} tone="neutral" />
                        <Badge label={persona.fixed ? "Fixed" : "Custom"} tone={persona.fixed ? "neutral" : "good"} />
                      </div>
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
