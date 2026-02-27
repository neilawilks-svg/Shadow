"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/badge";
import { CostPanel } from "@/components/cost-panel";
import { DocumentDropzone } from "@/components/document-dropzone";
import { SectionCard } from "@/components/section-card";
import { buildRealtimeGaSessionUpdateEvent } from "@/lib/audio/realtime-transcription";

interface DeviceOption {
  deviceId: string;
  label: string;
}

interface SegmentView {
  segmentId: string;
  speaker: string;
  text: string;
  createdAt: string;
  startedAt?: string;
}

interface HandRaiseView {
  eventId: string;
  headline: string;
  details: string;
  createdAt: string;
}

interface MorganResponseView {
  responseId: string;
  text: string;
  question?: string;
  createdAt: string;
  audioPath?: string;
  autoplay?: boolean;
}

interface DocumentRecord {
  id: string;
  title: string;
  tags: string[];
  meetingDate?: string;
}

interface SessionSummary {
  sessionId: string;
  title: string;
  status: "active" | "ended";
  startedAt: string;
  endedAt?: string;
  linkedDocumentIds: string[];
  transcriptCount: number;
  morganResponseCount: number;
}

interface SessionDetail {
  session: {
    sessionId: string;
    title: string;
    status: "active" | "ended";
    linkedDocumentIds?: string[];
  };
  transcriptSegments: Array<{
    segmentId: string;
    speaker: string;
    text: string;
    startedAt: string;
    endedAt: string;
  }>;
  handRaises: HandRaiseView[];
  morganResponses: MorganResponseView[];
}

export function MeetingClientPage() {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Morgan live meeting session");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "starting" | "active" | "failed" | "stopped">("idle");
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentView[]>([]);
  const [handRaises, setHandRaises] = useState<HandRaiseView[]>([]);
  const [morganResponses, setMorganResponses] = useState<MorganResponseView[]>([]);
  const [inviteQuestion, setInviteQuestion] = useState(
    "Morgan, what perspective might we be missing in this discussion?",
  );
  const [inviteResponse, setInviteResponse] = useState<string>("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [connectionHint, setConnectionHint] = useState<string>("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playedMorganResponsesRef = useRef(new Set<string>());

  const supportHint = useMemo(() => {
    const hasTarget = devices.some(
      (item) => item.label.includes("BlackHole") || item.label.includes("Microsoft Teams Audio"),
    );
    return hasTarget
      ? "System-audio route detected."
      : "Tip: select BlackHole or Teams Audio device for system meeting capture.";
  }, [devices]);

  const activeOrSelectedSessionId = selectedHistorySessionId || sessionId || "";

  const refreshAudioDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Audio device ${device.deviceId.slice(0, 6)}`,
        }));

      setDevices(audioInputs);
      if (!selectedDeviceId && audioInputs.length > 0) {
        const preferred =
          audioInputs.find((item) => item.label.includes("BlackHole")) ??
          audioInputs.find((item) => item.label.includes("Microsoft Teams Audio")) ??
          audioInputs[0];
        setSelectedDeviceId(preferred.deviceId);
      }
    } catch {
      setError("Microphone permission is required to list audio devices.");
    }
  }, [selectedDeviceId]);

  const playAudio = useCallback((url: string | null | undefined) => {
    if (!url) {
      return;
    }
    const audio = new Audio(url);
    void audio.play().catch(() => {
      // autoplay can fail depending on browser policy
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    const response = await fetch("/api/meeting/sessions?limit=120");
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { sessions: SessionSummary[] };
    setSessions(payload.sessions ?? []);
  }, []);

  const refreshDocuments = useCallback(async () => {
    const response = await fetch("/api/documents?limit=400");
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { documents: DocumentRecord[] };
    setDocuments(payload.documents ?? []);
  }, []);

  const refreshSessionDetail = useCallback(
    async (targetSessionId: string) => {
      if (!targetSessionId) {
        return;
      }

      setHistoryLoading(true);
      try {
        const response = await fetch(`/api/meeting/sessions/${targetSessionId}`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as SessionDetail;
        setSegments(
          (payload.transcriptSegments ?? []).map((segment) => ({
            segmentId: segment.segmentId,
            speaker: segment.speaker,
            text: segment.text,
            createdAt: segment.endedAt,
            startedAt: segment.startedAt,
          })),
        );
        setHandRaises(payload.handRaises ?? []);
        setMorganResponses(payload.morganResponses ?? []);
        setSelectedDocumentIds(payload.session.linkedDocumentIds ?? []);

        for (const responseItem of payload.morganResponses ?? []) {
          if (!responseItem.autoplay || !responseItem.audioPath) {
            continue;
          }
          if (playedMorganResponsesRef.current.has(responseItem.responseId)) {
            continue;
          }

          playedMorganResponsesRef.current.add(responseItem.responseId);
          const fileName = responseItem.audioPath.split("/").pop();
          if (fileName) {
            playAudio(`/api/meeting/audio/${encodeURIComponent(fileName)}`);
          }
        }
      } finally {
        setHistoryLoading(false);
      }
    },
    [playAudio],
  );

  const attachSelectedDocuments = useCallback(async () => {
    if (!sessionId || selectedDocumentIds.length === 0) {
      return;
    }

    const response = await fetch(`/api/meeting/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds: selectedDocumentIds }),
    });

    if (!response.ok) {
      setError("Unable to attach selected documents to the session.");
      return;
    }

    await refreshSessions();
    await refreshSessionDetail(sessionId);
  }, [refreshSessionDetail, refreshSessions, selectedDocumentIds, sessionId]);

  const sendTranscriptSegment = useCallback(
    async (text: string, speaker = "speaker") => {
      if (!sessionId || !text.trim()) {
        return;
      }

      const response = await fetch("/api/meeting/transcript-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          text,
          speaker,
          confidence: 0.85,
        }),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        segment: {
          segmentId: string;
          speaker: string;
          text: string;
          endedAt: string;
          startedAt: string;
        };
      };
      setSegments((current) => [
        ...current,
        {
          segmentId: payload.segment.segmentId,
          speaker: payload.segment.speaker,
          text: payload.segment.text,
          createdAt: payload.segment.endedAt,
          startedAt: payload.segment.startedAt,
        },
      ]);

      await refreshSessionDetail(sessionId);
    },
    [refreshSessionDetail, sessionId],
  );

  const startRealtimeTranscriptionSocket = useCallback(async () => {
    const tokenResponse = await fetch("/api/realtime/client-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "transcription" }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Unable to create realtime client secret.");
    }

    const tokenPayload = await tokenResponse.json();
    const token = tokenPayload?.value ?? tokenPayload?.client_secret?.value;
    const transcriptionModel =
      tokenPayload?.transcriptionModel ??
      tokenPayload?.session?.audio?.input?.transcription?.model ??
      "gpt-4o-mini-transcribe";
    const transcriptionLanguage =
      tokenPayload?.transcriptionLanguage ??
      tokenPayload?.session?.audio?.input?.transcription?.language ??
      "en";

    if (!token) {
      throw new Error("Realtime client secret missing.");
    }

    const ws = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", [
      "realtime",
      `openai-insecure-api-key.${token}`,
    ]);

    socketRef.current = ws;

    ws.onopen = () => {
      const sessionUpdate = buildRealtimeGaSessionUpdateEvent(transcriptionModel, transcriptionLanguage);
      ws.send(JSON.stringify(sessionUpdate));
      setConnectionHint(`Realtime connected with ${transcriptionModel}.`);
    };

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data));
        const eventType = event?.type;
        const transcriptText = extractTranscriptText(event);

        if (
          typeof transcriptText === "string" &&
          transcriptText.trim() &&
          (eventType === "conversation.item.input_audio_transcription.completed" ||
            eventType === "transcription.completed" ||
            eventType === "transcript.completed")
        ) {
          void sendTranscriptSegment(transcriptText.trim(), "meeting");
        }

        if (eventType === "error" && typeof event?.error?.message === "string") {
          setError(`Realtime transcription error: ${event.error.message}`);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setError(
        "Realtime WebSocket connection failed. You can continue using manual transcript input while testing.",
      );
      setConnectionHint("Realtime connection error. Manual transcript remains available.");
    };

    ws.onclose = (event) => {
      if (event.code === 1000 || status === "stopped") {
        return;
      }
      setConnectionHint(
        `Realtime disconnected (code ${event.code || 1005}). You can continue with manual transcript input.`,
      );
    };
  }, [sendTranscriptSegment, status]);

  const startAudioPipeline = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
    });

    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16BitPCM(input);
      const base64Audio = bytesToBase64(pcm16);

      socket.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64Audio,
        }),
      );
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }, [selectedDeviceId]);

  const startMeeting = useCallback(async () => {
    setError(null);

    if (!consentAccepted) {
      setError("Consent is required before meeting capture can start.");
      return;
    }

    try {
      setStatus("starting");

      const sessionResponse = await fetch("/api/meeting/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle.trim() || "Morgan live meeting session",
          consentAccepted: true,
        }),
      });

      if (!sessionResponse.ok) {
        throw new Error("Unable to create meeting session.");
      }

      const session = (await sessionResponse.json()) as { sessionId: string };
      setSessionId(session.sessionId);
      setSelectedHistorySessionId(session.sessionId);
      setSegments([]);
      setHandRaises([]);
      setMorganResponses([]);
      playedMorganResponsesRef.current.clear();

      const source = new EventSource(`/api/meeting/events/${session.sessionId}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          type: string;
          event: HandRaiseView;
        };

        if (payload.type === "hand_raise" || payload.type === "history") {
          setHandRaises((current) => {
            const exists = current.some((item) => item.eventId === payload.event.eventId);
            if (exists) {
              return current;
            }
            return [payload.event, ...current].slice(0, 30);
          });
        }
      };
      source.onerror = () => {
        // Keep session alive even if SSE reconnects.
      };
      eventSourceRef.current = source;

      await startRealtimeTranscriptionSocket();
      await startAudioPipeline();

      if (selectedDocumentIds.length > 0) {
        await fetch(`/api/meeting/sessions/${session.sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds: selectedDocumentIds }),
        });
      }

      await refreshSessions();
      await refreshSessionDetail(session.sessionId);

      setStatus("active");
      setConnectionHint("Streaming audio to OpenAI realtime transcription.");
    } catch (caught) {
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "Failed to start meeting capture.");
      setConnectionHint("Failed to initialize realtime streaming.");
    }
  }, [
    consentAccepted,
    refreshSessionDetail,
    refreshSessions,
    selectedDocumentIds,
    sessionTitle,
    startAudioPipeline,
    startRealtimeTranscriptionSocket,
  ]);

  const teardownMeetingResources = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    socketRef.current?.close();
    socketRef.current = null;

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const stopMeeting = useCallback(() => {
    teardownMeetingResources();

    setStatus("stopped");
    setConnectionHint("Meeting capture stopped.");

    if (sessionId) {
      void fetch(`/api/meeting/sessions/${sessionId}/end`, {
        method: "POST",
      });
      void refreshSessions();
    }
  }, [refreshSessions, sessionId, teardownMeetingResources]);

  const inviteMorgan = useCallback(async () => {
    if (!sessionId) {
      setError("Start a meeting session before inviting Morgan.");
      return;
    }

    const response = await fetch("/api/meeting/invite-morgan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        question: inviteQuestion,
      }),
    });

    if (!response.ok) {
      setError("Unable to fetch invited Morgan response.");
      return;
    }

    const payload = (await response.json()) as {
      response: string;
      audio?: { audioUrl?: string | null } | null;
    };
    setInviteResponse(payload.response);

    if (payload.audio?.audioUrl) {
      playAudio(payload.audio.audioUrl);
    }

    await refreshSessionDetail(sessionId);
    await refreshSessions();
  }, [inviteQuestion, playAudio, refreshSessionDetail, refreshSessions, sessionId]);

  const addManualSegment = useCallback(async () => {
    if (!manualTranscript.trim()) {
      return;
    }
    await sendTranscriptSegment(manualTranscript, "manual");
    setManualTranscript("");
  }, [manualTranscript, sendTranscriptSegment]);

  const downloadExport = useCallback(async (format: "md" | "json" | "srt") => {
    if (!activeOrSelectedSessionId) {
      setError("Select a session before exporting transcript.");
      return;
    }

    const response = await fetch(`/api/meeting/sessions/${activeOrSelectedSessionId}/export?format=${format}`);
    if (!response.ok) {
      setError(`Unable to export transcript as ${format}.`);
      return;
    }

    const blob = await response.blob();
    const fileName = `${activeOrSelectedSessionId}-transcript.${format === "md" ? "md" : format}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [activeOrSelectedSessionId]);

  useEffect(() => {
    void refreshAudioDevices();
    void refreshSessions();
    void refreshDocuments();

    return () => {
      teardownMeetingResources();
    };
  }, [refreshAudioDevices, refreshDocuments, refreshSessions, teardownMeetingResources]);

  useEffect(() => {
    if (!selectedHistorySessionId) {
      return;
    }
    void refreshSessionDetail(selectedHistorySessionId);
  }, [refreshSessionDetail, selectedHistorySessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSessions();
      if (activeOrSelectedSessionId) {
        void refreshSessionDetail(activeOrSelectedSessionId);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [activeOrSelectedSessionId, refreshSessionDetail, refreshSessions]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
      <SectionCard
        title="Live Meeting Cockpit"
        subtitle="Passive listening, session memory, transcript export, and Morgan autoplay audio"
        rightSlot={
          <div className="flex flex-wrap gap-2">
            <Badge label="Consent Required" tone={consentAccepted ? "good" : "warning"} />
            <Badge label="Redaction On" tone="good" />
            <Badge label="No Raw Audio Saved" tone="good" />
          </div>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <SectionCard title="Session Setup" subtitle="Audio source + meeting metadata + local documents">
              <div className="grid gap-3">
                <DocumentDropzone onDocumentsChanged={refreshDocuments} />

                <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                  Session Title
                  <input
                    value={sessionTitle}
                    onChange={(event) => setSessionTitle(event.target.value)}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => setConsentAccepted(event.target.checked)}
                    className="h-4 w-4"
                  />
                  I confirm meeting participants have consented to AI assistance and transcription.
                </label>

                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <select
                    value={selectedDeviceId}
                    onChange={(event) => setSelectedDeviceId(event.target.value)}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-1)]"
                  >
                    {devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void refreshAudioDevices()}
                    className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-2)]"
                  >
                    Refresh Devices
                  </button>
                </div>

                <p className="text-xs text-[color:var(--ink-3)]">{supportHint}</p>
                {connectionHint ? <p className="text-xs text-[color:var(--ink-3)]">{connectionHint}</p> : null}

                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-3)]">
                    Linked Documents ({selectedDocumentIds.length})
                  </p>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {documents.length === 0 ? (
                      <p className="text-xs text-[color:var(--ink-3)]">No indexed documents.</p>
                    ) : (
                      documents.map((doc) => (
                        <label key={doc.id} className="flex cursor-pointer items-start gap-2 text-xs text-[color:var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={selectedDocumentIds.includes(doc.id)}
                            onChange={() => {
                              setSelectedDocumentIds((current) => {
                                if (current.includes(doc.id)) {
                                  return current.filter((item) => item !== doc.id);
                                }
                                return [...current, doc.id];
                              });
                            }}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>
                            <span className="block font-semibold text-[color:var(--ink-1)]">{doc.title}</span>
                            <span className="block opacity-80">{(doc.tags ?? []).slice(0, 4).join(", ") || "no tags"}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void attachSelectedDocuments()}
                    disabled={!sessionId || selectedDocumentIds.length === 0}
                    className="mt-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] px-3 py-2 text-xs text-[color:var(--ink-2)] disabled:opacity-50"
                  >
                    Attach to active session
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void startMeeting()}
                    disabled={status === "starting" || status === "active"}
                    className="btn-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {status === "active" ? "Capturing" : status === "starting" ? "Starting..." : "Start Capture"}
                  </button>
                  <button
                    type="button"
                    onClick={stopMeeting}
                    className="rounded-full border border-[color:var(--line)] bg-[color:var(--field-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--ink-2)]"
                  >
                    Stop
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Live Transcript"
              subtitle="Realtime transcription with manual fallback"
            >
              <div className="mb-3 flex gap-2">
                <textarea
                  value={manualTranscript}
                  onChange={(event) => setManualTranscript(event.target.value)}
                  placeholder="Manual transcript fallback input"
                  className="min-h-20 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                />
                <button
                  type="button"
                  onClick={() => void addManualSegment()}
                  className="h-fit rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-sm text-[color:var(--ink-2)]"
                >
                  Add
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                {segments.length === 0 ? (
                  <p className="text-sm text-[color:var(--ink-3)]">No transcript segments yet.</p>
                ) : (
                  segments
                    .slice()
                    .reverse()
                    .map((segment) => (
                      <article
                        key={segment.segmentId}
                        className="rounded-lg bg-[color:var(--card-bg)] p-2 text-sm"
                      >
                        <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--ink-3)]">
                          <span>{segment.speaker}</span>
                          <span>{new Date(segment.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-[color:var(--ink-1)]">{segment.text}</p>
                      </article>
                    ))
                )}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard
              title="Morgan Status"
              subtitle="Raise-hand queue, invited responses, and autoplay audio timeline"
              rightSlot={<Badge label={status.toUpperCase()} tone={status === "active" ? "good" : "neutral"} />}
            >
              <div
                className={`mb-3 rounded-2xl border p-3 ${
                  handRaises.length > 0
                    ? "border-[color:var(--accent-2)] bg-[color:var(--warn-bg)]"
                    : "border-[color:var(--line)] bg-[color:var(--surface-2)]"
                }`}
              >
                <p className="text-sm font-semibold text-[color:var(--ink-1)]">
                  {handRaises.length > 0 ? "Morgan is raising a hand" : "Morgan is listening"}
                </p>
                <p className="text-xs text-[color:var(--ink-3)]">
                  {handRaises.length > 0
                    ? "A meaningful pattern was detected. Review intervention queue."
                    : "No active intervention suggested right now."}
                </p>
              </div>

              <div className="grid gap-2">
                <textarea
                  value={inviteQuestion}
                  onChange={(event) => setInviteQuestion(event.target.value)}
                  className="min-h-24 rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] p-3 text-sm text-[color:var(--ink-1)]"
                />
                <button
                  type="button"
                  onClick={() => void inviteMorgan()}
                  className="btn-accent rounded-full px-4 py-2 text-sm font-semibold"
                >
                  Invite Morgan
                </button>
                {inviteResponse ? (
                  <article className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3 text-sm text-[color:var(--ink-1)]">
                    {inviteResponse}
                  </article>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-2)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-3)]">
                  Morgan Audio Timeline
                </p>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {morganResponses.length === 0 ? (
                    <p className="text-xs text-[color:var(--ink-3)]">No Morgan responses recorded yet.</p>
                  ) : (
                    morganResponses.map((response) => {
                      const fileName = response.audioPath?.split("/").pop();
                      const audioUrl = fileName
                        ? `/api/meeting/audio/${encodeURIComponent(fileName)}`
                        : null;

                      return (
                        <article key={response.responseId} className="rounded-lg bg-[color:var(--card-bg)] p-2 text-xs">
                          <p className="font-semibold text-[color:var(--ink-1)]">
                            {new Date(response.createdAt).toLocaleTimeString()} {response.autoplay ? "(autoplay)" : ""}
                          </p>
                          <p className="mb-2 text-[color:var(--ink-2)]">{response.text}</p>
                          <button
                            type="button"
                            onClick={() => playAudio(audioUrl)}
                            disabled={!audioUrl}
                            className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-2 py-1 text-xs text-[color:var(--ink-2)] disabled:opacity-50"
                          >
                            Play
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Session History" subtitle="Retrieve prior sessions and export transcripts (md/json/srt)">
              <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                {sessions.length === 0 ? (
                  <p className="text-sm text-[color:var(--ink-3)]">No sessions yet.</p>
                ) : (
                  sessions.map((item) => (
                    <button
                      type="button"
                      key={item.sessionId}
                      onClick={() => setSelectedHistorySessionId(item.sessionId)}
                      className={`w-full rounded-xl border p-2 text-left text-xs ${
                        selectedHistorySessionId === item.sessionId
                          ? "border-[color:var(--accent-1)] bg-[color:var(--good-bg)]"
                          : "border-[color:var(--line)] bg-[color:var(--card-bg)]"
                      }`}
                    >
                      <p className="font-semibold text-[color:var(--ink-1)]">{item.title}</p>
                      <p className="text-[color:var(--ink-3)]">
                        {new Date(item.startedAt).toLocaleString()} | {item.status} | transcript {item.transcriptCount}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadExport("md")}
                  disabled={!activeOrSelectedSessionId}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-xs text-[color:var(--ink-2)] disabled:opacity-50"
                >
                  Export Markdown
                </button>
                <button
                  type="button"
                  onClick={() => void downloadExport("json")}
                  disabled={!activeOrSelectedSessionId}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-xs text-[color:var(--ink-2)] disabled:opacity-50"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => void downloadExport("srt")}
                  disabled={!activeOrSelectedSessionId}
                  className="rounded-xl border border-[color:var(--line)] bg-[color:var(--field-bg)] px-3 py-2 text-xs text-[color:var(--ink-2)] disabled:opacity-50"
                >
                  Export SRT
                </button>
              </div>
              {historyLoading ? <p className="mt-2 text-xs text-[color:var(--ink-3)]">Loading session detail...</p> : null}
            </SectionCard>

            <SectionCard title="Intervention History" subtitle="Latest model-flagged raise-hand events">
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {handRaises.length === 0 ? (
                  <p className="text-sm text-[color:var(--ink-3)]">No hand-raise events yet.</p>
                ) : (
                  handRaises.map((event) => (
                    <article
                      key={event.eventId}
                      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--card-bg)] p-3"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[color:var(--ink-1)]">{event.headline}</h3>
                        <span className="text-xs text-[color:var(--ink-3)]">
                          {new Date(event.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-[color:var(--ink-2)]">{event.details}</p>
                    </article>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
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

function floatTo16BitPCM(input: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function extractTranscriptText(event: Record<string, unknown>): string | null {
  const direct =
    (typeof event?.transcript === "string" && event.transcript) ||
    (typeof event?.text === "string" && event.text) ||
    null;

  if (direct) {
    return direct;
  }

  const item = event?.item as
    | {
        content?: Array<{ transcript?: string; text?: string }>;
      }
    | undefined;

  const fromItem = item?.content?.[0];
  if (typeof fromItem?.transcript === "string" && fromItem.transcript.trim()) {
    return fromItem.transcript;
  }

  if (typeof fromItem?.text === "string" && fromItem.text.trim()) {
    return fromItem.text;
  }

  return null;
}
