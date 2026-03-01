"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { DocumentDropzone } from "@/components/document-dropzone";
import { SectionCard } from "@/components/section-card";

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

interface AgendaItemDraft {
  id: string;
  title: string;
  timePercent: number;
  detailedDescription: string;
  desiredOutput: string;
  questions: string[];
}

interface RunResult {
  runId: string;
  status: string;
  agenda: string;
  topics: string[];
  firstSpeakerPersonaId?: string;
  skippedPersonaIds?: string[];
  warnings?: string[];
  sharedTranscript?: string[];
  activeStage?: "planning" | "rag" | "bidding" | "generation" | "persisting";
  lastHeartbeatAt?: string;
  lastCompletedTurn?: number;
  failureCode?: string;
  failureDetail?: string;
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
  type:
    | "run_started"
    | "run_heartbeat"
    | "run_stage"
    | "turn_started"
    | "turn_committed"
    | "run_warning"
    | "run_completed"
    | "run_failed";
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

interface ErrorPayload {
  error?: string;
}

export function ShadowBoardClientPage({ initialPersonas }: ShadowBoardClientPageProps) {
  const streamRef = useRef<EventSource | null>(null);
  const missingRunPollCountRef = useRef(0);
  const lastRunEventAtRef = useRef<number>(0);
  const tickInFlightRef = useRef(false);
  const isMorganPersona = (persona: Persona) => persona.name.trim().toLowerCase() === "morgan";
  const [personas] = useState<Persona[]>(initialPersonas);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(
    initialPersonas
      .filter((persona) => persona.role === "board_member" && !isMorganPersona(persona))
      .map((persona) => persona.id),
  );
  const [agendaItems, setAgendaItems] = useState<AgendaItemDraft[]>([
    {
      id: "agenda-item-1",
      title: "Show Me the Value: Will AI Mean the end of Time & Materials pricing?",
      timePercent: 60,
      detailedDescription:
        "For decades, consulting and professional services fees have been grounded in effort: time-and-materials or fixed-price models tied to hours invested. AI is disrupting that foundation. A notable example is KPMG reportedly negotiating a 14% fee reduction from its own auditor, arguing AI should lower delivery cost. This highlights a deeper shift: if consultants can use AI to deliver faster, clients can increasingly access similar capabilities. As information asymmetry narrows, firms may need to differentiate through accountability for outcomes rather than effort expended, including standing behind AI-generated recommendations and delivery quality. This implies higher risk and revenue variability for firms used to predictable utilisation models. It raises strategic questions for Slalom UK & Ireland on pricing, value articulation, contract structures, governance, and how to avoid commoditisation while maintaining quality and innovation.",
      desiredOutput:
        "Share the insights and different perspectives of the CAB Board Members. Where is there alignment, where did opinions differ. What questions were raised? Were there any recommendations of actions Slalom should take to position themselves effectively?",
      questions: [],
    },
    {
      id: "agenda-item-2",
      title: "Seek CAB input into Slalom’s “Best and Beyond” Strategy.",
      timePercent: 40,
      detailedDescription:
        "Slalom has launched a new strategy called “Best and Beyond” (Jan 2026). We would welcome your reflections and feedback.\n\nContext - Why We’re Changing\n- Market dynamics shifted: demand tightened, AI raised expectations, and clients now want faster, measurable value.\n- The type of work changed: resource consulting declined sharply while project consulting strengthened and grew.\n- Effort wasn’t compounding: people worked hard, but the system no longer multiplied that effort, requiring a reset.\n\nWhere We Stand\n- Strengthened financial position: Slalom is debt-free, stable, and able to invest deliberately.\n- Real momentum returning: record bookings, high utilisation, and client value scores at all-time highs.\n- AI leadership gap = opportunity: only 40% of clients see us as an AI leader - a clear, addressable upside.\n\nBest & Beyond - Three Core Priorities\n- Elevate sales: operate the core efficiently; shift to outcomes; expand with new commercial models.\n- Ignite our culture, together: clarify One Slalom ways of working; build the Empowerment Company; enable 10x team impact.\n- Lead with AI: deepen hyperscaler partnerships; become an AI-native organisation; scale human + agent workflows.\n\nSummary for Slalom CAB London\n“Best and Beyond” is Slalom’s updated two-year strategy and operating focus as the firm approaches its 25-year mark. It explains why recent performance felt harder despite strong client work, and how Slalom intends to restore durable growth by reconnecting effort to impact through a clearer, more integrated system.\n\nPurpose and framing\nSlalom’s purpose is to help people and organizations “dream bigger, move faster, and build better tomorrows for all,” while building a company where team members are empowered to grow and feel connected. The strategy aims to align culture, innovation, and execution so results compound again.\n\nWhat changed in the market\n- The economy moved from demand > supply to supply > demand, tightening professional services economics and increasing outcome accountability.\n- AI began changing how clients judge speed, value, and credibility.\n- COVID-era work shifts altered how teams connect and how trust forms.\n- Competitors adopted practices that once differentiated Slalom, eroding uniqueness.\n\nBusiness model explanation\nHistorically Slalom ran two complementary models:\n1) Core project consulting (end-to-end outcomes)\n2) Resource consulting (individuals/small teams in clients)\nAt peak (2022) the mix was roughly balanced. From early 2023, resource consulting fell sharply as smaller clients pulled back, while core project consulting grew in a difficult market but not enough to offset the speed/magnitude of decline. Slalom deliberately avoided offshore managed services annuity contracts to reinforce proximity and outcomes, but this reduced fallback annuity stability during downturns.\n\nEarly indicators for future growth\n- First year in three with improved sales bookings in both Q4 and second half.\n- Q4 2025 bookings up 20% YoY; December 2025 among strongest sales months ever.\n- Largest Q4 ever; second-semester bookings exceeding goal.\n- Utilization back above target; billings sustainably increasing.\n- Client survey results among highest in history, including an “industry best” for value creation.\n\nAt the same time, Slalom acknowledges gaps: only 40% of clients currently perceive Slalom as leading with AI, and internal empowerment scores declined, though client delivery remained strong.\n\nStrategic shift\nRather than a broad list of initiatives, Slalom frames the strategy as a disciplined system for compounding effort over a two-year window. The firm is entering this chapter debt-free, with a strong balance sheet and ability to invest deliberately. Execution is intended to show up market-by-market, with each market reaching all-time performance and then exceeding it, supported by One Slalom collaboration.\n\nBottom line\nSlalom’s updated strategy responds to structural market change and resource-consulting decline. The plan emphasizes disciplined integration across the firm, stronger differentiation through measurable outcomes (not hours), and accelerated credibility in AI, executed through a focused two-year operating system intended to restore durable, compounding growth.\n\nPriorities and horizons\nSlalom’s approach: three priorities pursued across three horizons (near-term core integration -> outcome-driven differentiation -> durable frontier moves), forming “Slalom’s 3x3”.",
      desiredOutput:
        "Share the insights and different perspectives of the CAB Board Members. Where is there alignment, where did opinions differ. What questions were raised?",
      questions: [
        "Are you in the 40% who see Slalom as an AI leader, and if not, what would move you into that group?",
        "We currently deliver 10x impact sometimes, and average 3x impact across our work. The industry average is 2x impact. How do we move to delivering 10x impact most of the time?",
      ],
    },
  ]);
  const [meetingArtifacts, setMeetingArtifacts] = useState(
    "Board packet summary:\n- baseline operating assumptions and constraints\n- key delivery dependencies\n\nBoard packet summary:\n- current risk posture\n- control expectations",
  );
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
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptPdfLoading, setTranscriptPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readErrorMessage = useCallback(async (response: Response, fallback: string) => {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
      if (payload?.error && payload.error.trim()) {
        return payload.error.trim();
      }
    }
    return `${fallback} (HTTP ${response.status})`;
  }, []);

  const agendaPercentTotal = useMemo(
    () => agendaItems.reduce((sum, item) => sum + (Number.isFinite(item.timePercent) ? item.timePercent : 0), 0),
    [agendaItems],
  );

  const agendaValidationError = useMemo(() => {
    if (agendaItems.length === 0) {
      return "Add at least one agenda item.";
    }
    if (agendaItems.some((item) => !item.title.trim())) {
      return "Each agenda item needs a title.";
    }
    if (agendaPercentTotal !== 100) {
      return `Agenda percentages must total exactly 100% (current total: ${agendaPercentTotal}%).`;
    }
    return null;
  }, [agendaItems, agendaPercentTotal]);

  const derivedAgenda = useMemo(
    () =>
      agendaItems
        .map((item, index) => `${index + 1}. ${item.title.trim()}`)
        .filter(Boolean)
        .join(" | "),
    [agendaItems],
  );

  const derivedTopics = useMemo(
    () =>
      agendaItems
        .map((item) => item.title.trim())
        .filter(Boolean),
    [agendaItems],
  );

  const meetingArtifactList = useMemo(
    () =>
      meetingArtifacts
        .split(/\r?\n\s*\r?\n/g)
        .map((block) =>
          block
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .join("\n"),
        )
        .filter(Boolean),
    [meetingArtifacts],
  );

  const selectedPersonaCount = useMemo(() => selectedPersonaIds.length, [selectedPersonaIds]);

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

  const updateAgendaItem = useCallback((id: string, patch: Partial<AgendaItemDraft>) => {
    setAgendaItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const addAgendaItem = useCallback(() => {
    setAgendaItems((current) => [
      ...current,
      {
        id: `agenda-item-${Date.now()}`,
        title: "",
        timePercent: 0,
        detailedDescription: "",
        desiredOutput: "",
        questions: [],
      },
    ]);
  }, []);

  const removeAgendaItem = useCallback((id: string) => {
    setAgendaItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const addQuestion = useCallback((agendaItemId: string) => {
    setAgendaItems((current) =>
      current.map((item) =>
        item.id === agendaItemId ? { ...item, questions: [...item.questions, ""] } : item,
      ),
    );
  }, []);

  const updateQuestion = useCallback((agendaItemId: string, questionIndex: number, value: string) => {
    setAgendaItems((current) =>
      current.map((item) => {
        if (item.id !== agendaItemId) {
          return item;
        }
        return {
          ...item,
          questions: item.questions.map((question, idx) => (idx === questionIndex ? value : question)),
        };
      }),
    );
  }, []);

  const removeQuestion = useCallback((agendaItemId: string, questionIndex: number) => {
    setAgendaItems((current) =>
      current.map((item) =>
        item.id === agendaItemId
          ? { ...item, questions: item.questions.filter((_, idx) => idx !== questionIndex) }
          : item,
      ),
    );
  }, []);

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

  const fetchRunById = useCallback(async (runId: string): Promise<{ run: RunResult | null; status: number }> => {
    const response = await fetch(`/api/shadow-board/runs/${runId}`);
    if (!response.ok) {
      return { run: null, status: response.status };
    }
    return { run: (await response.json()) as RunResult, status: response.status };
  }, []);

  const tickRun = useCallback(async (runId: string): Promise<void> => {
    if (tickInFlightRef.current) {
      return;
    }
    tickInFlightRef.current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/shadow-board/runs/${runId}/tick`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Tick failed");
        setError(message);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setError("Tick request timed out. Retrying...");
      }
    } finally {
      window.clearTimeout(timer);
      tickInFlightRef.current = false;
    }
  }, [readErrorMessage]);

  const downloadTranscriptPdf = useCallback(async () => {
    setError(null);
    const runId = runResult?.runId ?? runs[0]?.runId;
    if (!runId) {
      setError("No run found to export transcript from.");
      return;
    }

    setTranscriptPdfLoading(true);
    try {
      const anchor = document.createElement("a");
      anchor.href = `/api/shadow-board/runs/${runId}/transcript-pdf?ts=${Date.now()}`;
      anchor.download = `${runId}-transcript.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError(`Unable to download transcript PDF for run ${runId}.`);
    } finally {
      setTranscriptPdfLoading(false);
    }
  }, [runResult?.runId, runs]);

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
          lastRunEventAtRef.current = Date.now();
          missingRunPollCountRef.current = 0;

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

          if (payload.type === "run_failed") {
            const detail = payload.payload?.message;
            if (detail) {
              setError(detail);
            }
          }

          if (payload.type === "run_completed" || payload.type === "run_failed") {
            closeShadowStream();
            void refreshRuns();
          }
        } catch {
          // Ignore malformed stream payloads.
        }
      };

      source.onerror = () => {
        // EventSource auto-reconnects; keep stream open unless run terminal event arrives.
      };
    },
    [closeShadowStream, refreshRuns],
  );

  const runShadowBoard = useCallback(async () => {
    setError(null);
    if (selectedPersonaIds.length === 0) {
      setStatus("idle");
      setError("Select at least one persona before running the shadow board.");
      return;
    }
    if (agendaValidationError) {
      setStatus("idle");
      setError(agendaValidationError);
      return;
    }
    setStatus("running");
    setRunWarnings([]);
    missingRunPollCountRef.current = 0;
    closeShadowStream();

    try {
      const normalizedAgendaItems = agendaItems.map((item, index) => ({
        id: item.id || `agenda-item-${index + 1}`,
        title: item.title.trim(),
        timePercent: Math.round(item.timePercent),
        detailedDescription: item.detailedDescription.trim(),
        desiredOutput: item.desiredOutput.trim(),
        questions: item.questions.map((question) => question.trim()).filter(Boolean),
      }));

      const response = await fetch("/api/shadow-board/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda: derivedAgenda,
          topics: derivedTopics,
          agendaItems: normalizedAgendaItems,
          personaIds: selectedPersonaIds,
          meetingId: selectedMeetingId || undefined,
          shadowSessionId: shadowSessionId || undefined,
          documentIds: selectedDocumentIds,
          reasoningLevel,
          maxConversationTurns,
          randomness,
          meetingArtifacts: meetingArtifactList,
          transcriptSeed: [
            `Board Chair: Agenda - ${derivedAgenda}`,
            `Board Chair: Focus topics - ${derivedTopics.join("; ")}`,
          ],
        }),
      });

      if (!response.ok) {
        setStatus("failed");
        setError(await readErrorMessage(response, "Unable to start shadow board run."));
        return;
      }

      const payload = (await response.json()) as RunResult;
      setRunResult(payload);
      setStatus(payload.status);
      setRunWarnings(payload.warnings ?? []);
      if (payload.status === "running" || payload.status === "queued") {
        openShadowStream(payload.runId);
      }

      void refreshRuns();
    } catch {
      setStatus("failed");
      setError("Unable to start shadow board run. Check your network and try again.");
    }
  }, [
    agendaItems,
    agendaValidationError,
    closeShadowStream,
    derivedAgenda,
    derivedTopics,
    maxConversationTurns,
    meetingArtifactList,
    openShadowStream,
    randomness,
    reasoningLevel,
    refreshRuns,
    selectedDocumentIds,
    selectedMeetingId,
    shadowSessionId,
    selectedPersonaIds,
    readErrorMessage,
  ]);

  useEffect(() => {
    if (personas.length === 0 || selectedPersonaIds.length > 0) {
      return;
    }

    const boardMemberIds = personas
      .filter((persona) => persona.role === "board_member" && !isMorganPersona(persona))
      .map((persona) => persona.id);
    if (boardMemberIds.length > 0) {
      setSelectedPersonaIds(boardMemberIds);
      return;
    }

    setSelectedPersonaIds(personas.map((persona) => persona.id));
  }, [personas, selectedPersonaIds.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshDocuments();
      void refreshSessions();
      void refreshRuns();
    }, 0);

    return () => clearTimeout(timer);
  }, [refreshDocuments, refreshRuns, refreshSessions]);

  useEffect(() => {
    if (!runResult?.runId || (status !== "running" && status !== "queued")) {
      return;
    }

    const runId = runResult.runId;
    const interval = window.setInterval(() => {
      void (async () => {
        if (status === "running" || status === "queued") {
          await tickRun(runId);
        }
        const result = await fetchRunById(runId);
        if (result.status === 404) {
          const recentlyReceivedEvent = Date.now() - lastRunEventAtRef.current < 45_000;
          if (!recentlyReceivedEvent) {
            missingRunPollCountRef.current += 1;
          }
          if (missingRunPollCountRef.current >= 24) {
            setStatus("failed");
            setError("Run state unavailable after repeated retries. Please restart the run.");
            closeShadowStream();
          }
          return;
        }

        missingRunPollCountRef.current = 0;
        const latest = result.run;
        if (!latest) {
          return;
        }
        setRunResult(latest);
        setStatus(latest.status);
        if (latest.status === "failed" && latest.failureCode) {
          setError(`${latest.failureCode}: ${latest.failureDetail ?? "Run failed."}`);
        }
        if (Array.isArray(latest.warnings)) {
          setRunWarnings(latest.warnings);
        }
        if (latest.status === "completed" || latest.status === "failed") {
          void refreshRuns();
          closeShadowStream();
        }
      })();
    }, 2500);

    return () => {
      window.clearInterval(interval);
    };
  }, [closeShadowStream, fetchRunById, refreshRuns, runResult?.runId, status, tickRun]);

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

              <div className="grid gap-2 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[color:var(--ink-1)]">Agenda Items</p>
                  <button
                    type="button"
                    onClick={addAgendaItem}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-1.5 text-xs text-[color:var(--ink-2)]"
                  >
                    + Add agenda item
                  </button>
                </div>
                <p className="text-xs text-[color:var(--ink-3)]">
                  Total: {agendaPercentTotal}% (must be exactly 100%)
                </p>
                {agendaItems.map((item, index) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-3)]">Agenda Item {index + 1}</p>
                      {agendaItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeAgendaItem(item.id)}
                          className="rounded-full border border-[color:var(--line)] px-2 py-0.5 text-[10px] text-[color:var(--ink-2)]"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                      Topic Title
                      <input
                        value={item.title}
                        onChange={(event) => updateAgendaItem(item.id, { title: event.target.value })}
                        className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                      />
                    </label>

                    <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                      % of Discussion Time
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={item.timePercent}
                        onChange={(event) =>
                          updateAgendaItem(item.id, {
                            timePercent: Number.parseInt(event.target.value || "0", 10) || 0,
                          })
                        }
                        className="w-36 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                      />
                    </label>

                    <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                      Detailed Description
                      <textarea
                        value={item.detailedDescription}
                        onChange={(event) => updateAgendaItem(item.id, { detailedDescription: event.target.value })}
                        className="min-h-36 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                      />
                    </label>

                    <label className="grid gap-1 text-xs text-[color:var(--ink-3)]">
                      Desired Output
                      <textarea
                        value={item.desiredOutput}
                        onChange={(event) => updateAgendaItem(item.id, { desiredOutput: event.target.value })}
                        className="min-h-20 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                      />
                    </label>

                    <div className="grid gap-2 text-xs text-[color:var(--ink-3)]">
                      <div className="flex items-center justify-between gap-2">
                        <p>Specific Questions (optional)</p>
                        <button
                          type="button"
                          onClick={() => addQuestion(item.id)}
                          className="rounded-full border border-[color:var(--line)] px-2 py-0.5 text-[10px] text-[color:var(--ink-2)]"
                        >
                          + Add question
                        </button>
                      </div>
                      {item.questions.length === 0 ? (
                        <p className="text-[11px] text-[color:var(--ink-3)]">No questions added for this agenda item.</p>
                      ) : (
                        <div className="grid gap-2">
                          {item.questions.map((question, questionIndex) => (
                            <div
                              key={`${item.id}-question-${questionIndex}`}
                              className="grid gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-[color:var(--ink-3)]">
                                  Question {questionIndex + 1}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeQuestion(item.id, questionIndex)}
                                  className="rounded-full border border-[color:var(--line)] px-2 py-0.5 text-[10px] text-[color:var(--ink-2)]"
                                >
                                  Remove
                                </button>
                              </div>
                              <textarea
                                value={question}
                                onChange={(event) => updateQuestion(item.id, questionIndex, event.target.value)}
                                className="min-h-16 rounded-lg border border-[color:var(--line)] bg-[color:var(--card-bg)] p-2 text-sm text-[color:var(--ink-1)]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {agendaValidationError ? (
                  <p className="text-xs text-[color:var(--warn-ink)]">{agendaValidationError}</p>
                ) : null}
              </div>

              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                Meeting Artifacts (multi-line blocks, separated by a blank line)
                <textarea
                  value={meetingArtifacts}
                  onChange={(event) => setMeetingArtifacts(event.target.value)}
                  className="min-h-24 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                />
                <span className="text-xs text-[color:var(--ink-3)]">
                  Artifact blocks detected: {meetingArtifactList.length}
                </span>
              </label>
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
                    max={30}
                    value={maxConversationTurns}
                    onChange={(event) => setMaxConversationTurns(Number(event.target.value))}
                  />
                  <span className="text-[10px] text-[color:var(--ink-3)]">
                    Temporary reliability cap while long-run stabilization is in progress.
                  </span>
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
                    No files attached to this run yet. You can still run, but transcript context may be less grounded.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void runShadowBoard()}
                disabled={selectedPersonaCount === 0 || Boolean(agendaValidationError)}
                className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {status === "running" ? "Running..." : "Run Shadow Board"}
              </button>
              {error ? (
                <p className="text-xs text-[color:var(--warn-ink)]">
                  {error}
                </p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Outcome" subtitle="Run status, transcript, warnings, and recent runs">
            {!runResult ? (
              <p className="text-sm text-[color:var(--ink-3)]">No run yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3 text-xs text-[color:var(--ink-2)]">
                  <p>
                    Progress: {runResult.lastCompletedTurn ?? 0} / {maxConversationTurns} turns
                  </p>
                  <p>Stage: {runResult.activeStage ?? "planning"}</p>
                  <p>
                    Last heartbeat:{" "}
                    {runResult.lastHeartbeatAt ? new Date(runResult.lastHeartbeatAt).toLocaleTimeString() : "n/a"}
                  </p>
                  {runResult.failureCode ? (
                    <p>
                      Failure: {runResult.failureCode}
                      {runResult.failureDetail ? ` - ${runResult.failureDetail}` : ""}
                    </p>
                  ) : null}
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

                <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Run Transcript</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadTranscriptPdf()}
                        disabled={transcriptPdfLoading}
                        className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] text-[color:var(--ink-2)] disabled:opacity-50"
                      >
                        {transcriptPdfLoading ? "Downloading..." : "Download PDF"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTranscriptExpanded((current) => !current)}
                        className="rounded-full border border-[color:var(--line)] px-2 py-1 text-[10px] text-[color:var(--ink-2)]"
                      >
                        {transcriptExpanded ? "Collapse" : "Expand"}
                      </button>
                    </div>
                  </div>
                  <div
                    className={`space-y-1 overflow-y-auto text-xs text-[color:var(--ink-2)] ${
                      transcriptExpanded ? "max-h-[75vh]" : "max-h-36"
                    }`}
                  >
                    {(runResult.sharedTranscript ?? []).length === 0 ? (
                      <p>No transcript lines yet.</p>
                    ) : (
                      (runResult.sharedTranscript ?? []).slice(-200).map((line, index) => (
                        <p key={`${index}-${line.slice(0, 14)}`} className="whitespace-pre-wrap">
                          {line}
                        </p>
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

      <CostPanel />

    </div>
  );
}
