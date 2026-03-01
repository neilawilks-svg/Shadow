import type { ShadowBoardRun, ShadowBoardRunEvent } from "@/types/domain";

export function rehydrateRunFromEvents(runId: string, events: ShadowBoardRunEvent[]): ShadowBoardRun | null {
  if (events.length === 0) {
    return null;
  }

  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const startEvent = sorted.find((event) => event.type === "run_started");
  const runFromStart = startEvent?.payload.run;
  if (!runFromStart) {
    return null;
  }

  const transcript = sorted
    .filter((event) => event.type === "turn_committed" && typeof event.payload.transcriptLine === "string")
    .map((event) => event.payload.transcriptLine as string);
  const warnings = sorted
    .filter((event) => event.type === "run_warning" && typeof event.payload.message === "string")
    .map((event) => event.payload.message as string);

  const turnMeta = sorted
    .filter((event) => event.type === "turn_committed" && typeof event.payload.turnIndex === "number")
    .map((event) => ({
      turnIndex: Number(event.payload.turnIndex),
      agendaItemId: "rehydrated-agenda-item",
      topic: String(event.payload.topic ?? ""),
      speakerPersonaId: typeof event.payload.speakerPersonaId === "string" ? event.payload.speakerPersonaId : undefined,
    }));

  const firstSpeaker = sorted.find(
    (event) => event.type === "turn_started" && event.payload.turnIndex === 1 && typeof event.payload.speakerPersonaId === "string",
  )?.payload.speakerPersonaId;

  const failedEvent = [...sorted].reverse().find((event) => event.type === "run_failed");
  const completedEvent = [...sorted].reverse().find((event) => event.type === "run_completed");
  const status: ShadowBoardRun["status"] = failedEvent ? "failed" : completedEvent ? "completed" : "running";
  const finishedAt = failedEvent?.createdAt ?? completedEvent?.createdAt;

  return {
    ...runFromStart,
    runId,
    sharedTranscript: transcript,
    turnMeta,
    firstSpeakerPersonaId: firstSpeaker ?? runFromStart.firstSpeakerPersonaId,
    skippedPersonaIds: runFromStart.skippedPersonaIds ?? [],
    warnings,
    status,
    startedAt: startEvent?.createdAt ?? sorted[0]?.createdAt ?? new Date().toISOString(),
    finishedAt,
    activeStage: "persisting",
    lastHeartbeatAt: sorted.at(-1)?.createdAt,
    lastCompletedTurn: transcript.length,
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
    error: failedEvent?.payload.message,
  };
}
