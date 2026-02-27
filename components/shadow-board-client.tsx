"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { DocumentDropzone } from "@/components/document-dropzone";
import { SectionCard } from "@/components/section-card";
import { ShadowBoard8BitRoam } from "@/components/shadow-board-8bit";

interface Persona {
  id: string;
  name: string;
  role: "board_member" | "slalom_facilitator";
  fixed: boolean;
  lens: string;
  paceIncentive?: "accelerate" | "balanced" | "deliberate";
}

interface DocumentRecord {
  id: string;
  title: string;
  tags: string[];
  meetingDate?: string;
  sourcePath: string;
}

interface MeetingSessionSummary {
  sessionId: string;
  title: string;
  status: "active" | "ended";
  startedAt: string;
}

interface RunSummary {
  runId: string;
  status: string;
  startedAt: string;
  agenda: string;
}

interface RunResult {
  runId: string;
  status: string;
  agenda: string;
  topics: string[];
  outputFormat?: "markdown" | "plain_text";
  targetWordCount?: number;
  firstSpeakerPersonaId?: string;
  skippedPersonaIds?: string[];
  warnings?: string[];
  consensusSummary: string;
  dissentSummary: string;
  sharedTranscript?: string[];
  turnBids?: Array<{
    personaId: string;
    urgency_1_to_10: number;
    shouldSpeak: boolean;
    confidence: number;
  }>;
  outputs: Array<{
    personaId: string;
    personaName: string;
    comment: string;
    comments: string[];
    viewpoint: string;
    thinkingSteps: string[];
    confidence: number;
  }>;
  recommendations: Array<{
    theme: string;
    recommendation: string;
    confidence: number;
  }>;
}

interface ShadowBoardRunEvent {
  eventId: string;
  runId: string;
  type: "run_started" | "turn_started" | "turn_committed" | "run_warning" | "run_completed" | "run_failed";
  createdAt: string;
  payload?: {
    message?: string;
    run?: RunResult;
    turnIndex?: number;
    topic?: string;
    speakerPersonaId?: string;
    speakerName?: string;
    transcriptLine?: string;
  };
}

interface ShadowBoardClientPageProps {
  initialPersonas: Persona[];
}

export function ShadowBoardClientPage({ initialPersonas }: ShadowBoardClientPageProps) {
  const streamRef = useRef<EventSource | null>(null);
  const [personas] = useState<Persona[]>(initialPersonas);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(
    initialPersonas.filter((persona) => persona.role === "board_member").map((persona) => persona.id),
  );
  const [agenda, setAgenda] = useState("Evaluate expansion strategy for an AI-enabled board advisory offer.");
  const [topics, setTopics] = useState("market positioning, risk controls, operating model, talent readiness");
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [suggestingTopics, setSuggestingTopics] = useState(false);
  const [topicSuggestError, setTopicSuggestError] = useState<string | null>(null);
  const [meetingArtifacts, setMeetingArtifacts] = useState(
    "Board packet summary: baseline operating assumptions and constraints.\nBoard packet summary: current risk posture and control expectations.",
  );
  const [outputFormat, setOutputFormat] = useState<"markdown" | "plain_text">("markdown");
  const [targetWordCount, setTargetWordCount] = useState(600);
  const [reasoningLevel, setReasoningLevel] = useState(6);
  const [maxConversationTurns, setMaxConversationTurns] = useState(24);
  const [randomness, setRandomness] = useState(0.2);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [shadowSessionId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const storageKey = "shadow-board-session-id";
    const existing = window.localStorage.getItem(storageKey);
    if (existing && existing.trim()) {
      return existing.trim();
    }

    const generated =
      typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `shadow-session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    window.localStorage.setItem(storageKey, generated);
    return generated;
  });
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sessions, setSessions] = useState<MeetingSessionSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [status, setStatus] = useState("idle");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runWarnings, setRunWarnings] = useState<string[]>([]);
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

  const meetingArtifactList = useMemo(
    () =>
      meetingArtifacts
        .split(/\r?\n+/)
        .map((item) => item.trim())
        .filter(Boolean),
    [meetingArtifacts],
  );

  const selectedPersonaCount = useMemo(() => selectedPersonaIds.length, [selectedPersonaIds]);

  const roamPersonas = useMemo(() => {
    const outputByName = new Map(runResult?.outputs.map((output) => [output.personaName, output]) ?? []);

    return personas
      .filter((persona) => selectedPersonaIds.includes(persona.id))
      .map((persona) => {
        const output = outputByName.get(persona.name);
        const existingComments = (output?.comments ?? [])
          .map((comment) => comment.trim())
          .filter(Boolean)
          .slice(0, 6);

        return {
          id: persona.id,
          name: persona.name,
          comment: output?.comment ?? `${persona.name}: awaiting live run output.`,
          comments: existingComments,
          thinkingSteps: output?.thinkingSteps ?? [],
        };
      });
  }, [personas, runResult?.outputs, selectedPersonaIds]);

  const togglePersona = useCallback((id: string) => {
    setSelectedPersonaIds((current) => {
      if (current.includes(id)) {
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }, []);

  const toggleDocument = useCallback((id: string) => {
    setSelectedDocumentIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }, []);

  const suggestTopics = useCallback(
    async (agendaValue: string) => {
      const trimmedAgenda = agendaValue.trim();
      if (!trimmedAgenda) {
        return;
      }
      setTopicSuggestError(null);
      setSuggestingTopics(true);
      try {
        const response = await fetch("/api/shadow-board/topics/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agenda: trimmedAgenda }),
        });
        if (!response.ok) {
          setTopicSuggestError("Unable to suggest topics.");
          return;
        }
        const payload = (await response.json()) as { topics?: string[] };
        if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
          setTopicSuggestError("No topics suggested.");
          return;
        }
        setTopics(payload.topics.join(", "));
      } catch {
        setTopicSuggestError("Unable to suggest topics.");
      } finally {
        setSuggestingTopics(false);
      }
    },
    [],
  );

  const refreshDocuments = useCallback(async () => {
    const response = await fetch("/api/documents?limit=400");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { documents: DocumentRecord[] };
    setDocuments(payload.documents ?? []);
  }, []);

  const refreshDocumentsAndSelect = useCallback(
    async (newDocumentIds: string[] = []) => {
      await refreshDocuments();
      if (newDocumentIds.length === 0) {
        return;
      }
      setSelectedDocumentIds((current) => Array.from(new Set([...current, ...newDocumentIds])));
    },
    [refreshDocuments],
  );

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/meeting/sessions?limit=100");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { sessions: MeetingSessionSummary[] };
    setSessions(payload.sessions ?? []);
  }, []);

  const refreshRuns = useCallback(async () => {
    const response = await fetch("/api/shadow-board/runs?limit=30");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { runs: RunSummary[] };
    setRuns(payload.runs ?? []);
  }, []);

  const closeShadowStream = useCallback(() => {
    if (!streamRef.current) {
      return;
    }
    streamRef.current.close();
    streamRef.current = null;
  }, []);

  const fetchReport = useCallback(async (runId: string) => {
    const reportResponse = await fetch(`/api/shadow-board/runs/${runId}/report`);
    if (!reportResponse.ok) {
      return;
    }
    const reportPayload = (await reportResponse.json()) as { content?: string; markdown?: string };
    setReportMarkdown(reportPayload.content ?? reportPayload.markdown ?? "");
  }, []);

  const openShadowStream = useCallback(
    (runId: string) => {
      closeShadowStream();
      const source = new EventSource(`/api/shadow-board/events/${runId}`);
      streamRef.current = source;

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as ShadowBoardRunEvent;
          if (!payload || payload.runId !== runId) {
            return;
          }

          if (payload.payload?.run) {
            setRunResult(payload.payload.run);
            setStatus(payload.payload.run.status);
            if (Array.isArray(payload.payload.run.warnings)) {
              setRunWarnings(payload.payload.run.warnings);
            }
          }

          if (payload.type === "run_warning" && payload.payload?.message) {
            setRunWarnings((current) => {
              const warningMessage = payload.payload?.message ?? "";
              if (!warningMessage) {
                return current;
              }
              if (current.includes(warningMessage)) {
                return current;
              }
              return [...current, warningMessage];
            });
          }

          if (payload.type === "run_completed" || payload.type === "run_failed") {
            closeShadowStream();
            void refreshRuns();
            void fetchReport(runId);
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      };

      source.onerror = () => {
        // EventSource auto-reconnects; keep stream open unless run terminal event arrives.
      };
    },
    [closeShadowStream, fetchReport, refreshRuns],
  );

  const runShadowBoard = useCallback(async () => {
    setError(null);
    setStatus("running");
    setRunWarnings([]);
    setReportMarkdown("");
    closeShadowStream();

    const response = await fetch("/api/shadow-board/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agenda,
        topics: topicArray,
        personaIds: selectedPersonaIds,
        meetingId: selectedMeetingId || undefined,
        shadowSessionId: shadowSessionId || undefined,
        documentIds: selectedDocumentIds,
        reasoningLevel,
        maxConversationTurns,
        randomness,
        meetingArtifacts: meetingArtifactList,
        outputFormat,
        targetWordCount,
        transcriptSeed: [`Board Chair: Agenda - ${agenda}`, `Board Chair: Focus topics - ${topicArray.join("; ")}`],
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
    setRunWarnings(payload.warnings ?? []);
    if (payload.status === "running") {
      openShadowStream(payload.runId);
    } else {
      void fetchReport(payload.runId);
    }

    void refreshRuns();
  }, [
    agenda,
    closeShadowStream,
    fetchReport,
    maxConversationTurns,
    meetingArtifactList,
    openShadowStream,
    randomness,
    reasoningLevel,
    outputFormat,
    refreshRuns,
    selectedDocumentIds,
    selectedMeetingId,
    shadowSessionId,
    selectedPersonaIds,
    targetWordCount,
    topicArray,
  ]);

  useEffect(() => {
    const agendaValue = agenda.trim();
    if (!agendaValue) {
      return;
    }
    const timer = setTimeout(() => {
      void suggestTopics(agendaValue);
    }, 900);
    return () => clearTimeout(timer);
  }, [agenda, suggestTopics]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshDocuments();
      void refreshSessions();
      void refreshRuns();
    }, 0);

    return () => clearTimeout(timer);
  }, [refreshDocuments, refreshRuns, refreshSessions]);

  useEffect(() => {
    return () => {
      closeShadowStream();
    };
  }, [closeShadowStream]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Virtual Shadow Board"
        subtitle="CAB roster simulation with deterministic turn selection, controls, and local vault retrieval"
        rightSlot={<Badge label={`${selectedPersonaCount} Speaking Members`} tone="good" />}
      >
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title="Run Setup" subtitle="Agenda, controls, roster, and document context">
            <div className="grid gap-3">
              <DocumentDropzone onDocumentsChanged={refreshDocumentsAndSelect} />

              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Meeting Context
                <select
                  value={selectedMeetingId}
                  onChange={(event) => setSelectedMeetingId(event.target.value)}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                >
                  <option value="">No linked session</option>
                  {sessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {session.title} ({new Date(session.startedAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Agenda
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[color:var(--ink-3)]">Long-form agenda supported.</span>
                  <button
                    type="button"
                    onClick={() => setAgendaExpanded((current) => !current)}
                    className="rounded-full border border-[color:var(--line)] px-2 py-1 text-xs text-[color:var(--ink-2)]"
                  >
                    {agendaExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
                <textarea
                  value={agenda}
                  onChange={(event) => setAgenda(event.target.value)}
                  onBlur={() => void suggestTopics(agenda)}
                  className={`rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)] ${
                    agendaExpanded ? "min-h-[75vh]" : "min-h-24"
                  }`}
                />
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Topics (comma separated)
                <div className="flex items-center gap-2">
                  <input
                    value={topics}
                    onChange={(event) => setTopics(event.target.value)}
                    className="flex-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                  />
                  <button
                    type="button"
                    onClick={() => void suggestTopics(agenda)}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-2 text-xs text-[color:var(--ink-2)]"
                    disabled={suggestingTopics}
                  >
                    {suggestingTopics ? "Suggesting..." : "Refresh Topics"}
                  </button>
                </div>
                {topicSuggestError ? <span className="text-xs text-[color:var(--warn-ink)]">{topicSuggestError}</span> : null}
              </label>

              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Meeting Artifacts (one line per artifact)
                <textarea
                  value={meetingArtifacts}
                  onChange={(event) => setMeetingArtifacts(event.target.value)}
                  className="min-h-24 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                />
              </label>
              <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                  Output Format
                  <select
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as "markdown" | "plain_text")}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="plain_text">Plain Text</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                  Target Length (words): {targetWordCount}
                  <input
                    type="range"
                    min={150}
                    max={2000}
                    step={50}
                    value={targetWordCount}
                    onChange={(event) => setTargetWordCount(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                  Reasoning Depth: {reasoningLevel}
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={reasoningLevel}
                    onChange={(event) => setReasoningLevel(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                  Max Conversation Turns: {maxConversationTurns}
                  <input
                    type="range"
                    min={3}
                    max={80}
                    value={maxConversationTurns}
                    onChange={(event) => setMaxConversationTurns(Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                  Randomness: {randomness.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={randomness}
                    onChange={(event) => setRandomness(Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {personas.map((persona) => {
                  const selected = selectedPersonaIds.includes(persona.id);
                  const isFacilitator = persona.role === "slalom_facilitator";
                  return (
                    <button
                      type="button"
                      key={persona.id}
                      onClick={() => togglePersona(persona.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm ${
                        selected
                          ? "border-[color:var(--accent-1)] bg-[color:var(--good-bg)] text-[color:var(--good-ink)]"
                          : "border-[color:var(--line)] bg-[color:var(--card-bg)] text-[color:var(--ink-2)]"
                      }`}
                    >
                      <p className="font-semibold">{persona.name}</p>
                      <p className="text-xs opacity-80">{persona.lens}</p>
                      <p className="text-[10px] opacity-75">
                        {isFacilitator ? "Slalom Facilitator" : "Board Member"} | Pace: {persona.paceIncentive ?? "balanced"}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-3)]">
                  Vault Documents ({selectedDocumentIds.length} selected)
                </p>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {documents.length === 0 ? (
                    <p className="text-xs text-[color:var(--ink-3)]">No documents indexed yet.</p>
                  ) : (
                    documents.map((doc) => {
                      const selected = selectedDocumentIds.includes(doc.id);
                      return (
                        <label key={doc.id} className="flex cursor-pointer items-start gap-2 text-xs text-[color:var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleDocument(doc.id)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>
                            <span className="block font-semibold text-[color:var(--ink-1)]">{doc.title}</span>
                            <span className="block opacity-80">
                              {(doc.tags ?? []).slice(0, 4).join(", ") || "no tags"}
                              {doc.meetingDate ? ` | ${doc.meetingDate}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {selectedDocumentIds.length === 0 ? (
                  <p className="mt-2 text-xs text-[color:var(--warn-ink)]">
                    No files attached to this run yet. You can still run, but recommendations may be less grounded.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void runShadowBoard()}
                disabled={selectedPersonaCount === 0}
                className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {status === "running" ? "Running..." : "Run Shadow Board"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Outcome" subtitle="Consensus, dissent, recommendation packet, and recent runs">
            {!runResult ? (
              <p className="text-sm text-[color:var(--ink-3)]">No run yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Consensus</p>
                  <p className="text-sm text-[color:var(--ink-1)]">{runResult.consensusSummary}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                  <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Dissent</p>
                  <p className="text-sm text-[color:var(--ink-1)]">{runResult.dissentSummary}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3 text-xs text-[color:var(--ink-2)]">
                  <p>
                    First speaker:{" "}
                    {runResult.firstSpeakerPersonaId
                      ? personas.find((persona) => persona.id === runResult.firstSpeakerPersonaId)?.name ??
                        runResult.firstSpeakerPersonaId
                      : "pending"}
                  </p>
                  <p>
                    Skipped members:{" "}
                    {(runResult.skippedPersonaIds ?? []).length > 0
                      ? (runResult.skippedPersonaIds ?? [])
                          .map((personaId) => personas.find((persona) => persona.id === personaId)?.name ?? personaId)
                          .join(", ")
                      : "none"}
                  </p>
                </div>
                {(runWarnings.length > 0 || (runResult.warnings ?? []).length > 0) ? (
                  <div className="rounded-xl border border-[color:var(--warn-ink)] bg-[color:var(--warn-bg)] p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--warn-ink)]">
                      Run Warnings
                    </p>
                    <div className="space-y-1 text-xs text-[color:var(--warn-ink)]">
                      {Array.from(new Set([...(runResult.warnings ?? []), ...runWarnings])).map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {runResult.recommendations.map((recommendation, index) => (
                    <article
                      key={`${recommendation.theme}-${index}`}
                      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3"
                    >
                      <p className="text-sm font-semibold text-[color:var(--ink-1)]">{recommendation.theme}</p>
                      <p className="text-sm text-[color:var(--ink-2)]">{recommendation.recommendation}</p>
                    </article>
                  ))}
                </div>

                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                  <p className="mb-1 text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Run Transcript</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto text-xs text-[color:var(--ink-2)]">
                    {(runResult.sharedTranscript ?? []).length === 0 ? (
                      <p>No transcript lines yet.</p>
                    ) : (
                      (runResult.sharedTranscript ?? []).slice(-20).map((line, index) => (
                        <p key={`${index}-${line.slice(0, 14)}`}>{line}</p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-3)]">Recent Runs</p>
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {runs.length === 0 ? (
                  <p className="text-xs text-[color:var(--ink-3)]">No prior runs yet.</p>
                ) : (
                  runs.map((run) => (
                    <article key={run.runId} className="rounded-lg bg-[color:var(--card-bg)] p-2 text-xs">
                      <p className="font-semibold text-[color:var(--ink-1)]">{run.runId}</p>
                      <p className="text-[color:var(--ink-2)]">{run.agenda}</p>
                      <p className="text-[color:var(--ink-3)]">
                        {new Date(run.startedAt).toLocaleString()} | {run.status}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      </SectionCard>

      <SectionCard
        title="8-Bit Virtual Board Roam"
        subtitle="Move around the boardroom and inspect each member's comments and reasoning bubbles"
      >
        <ShadowBoard8BitRoam
          key={runResult?.runId ?? "default-seed"}
          personas={roamPersonas}
          simulationSeed={runResult?.runId ?? "default-seed"}
          transcriptLines={runResult?.sharedTranscript ?? []}
          active={Boolean(runResult?.runId)}
        />
      </SectionCard>

      <SectionCard title="Shadow Board Report" subtitle="Markdown packet generated for board prep review">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-xs text-[color:var(--ink-2)]">
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
