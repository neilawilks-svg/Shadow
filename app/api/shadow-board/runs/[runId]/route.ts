import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun, getShadowBoardRunEvents } from "@/lib/store/repository";
import type { ShadowBoardRun, ShadowBoardRunEvent } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rehydrateRunFromEvents(runId: string, events: ShadowBoardRunEvent[]): ShadowBoardRun | null {
  if (events.length === 0) {
    return null;
  }

  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const startEvent = sorted.find((event) => event.type === "run_started");
  const runFromStart = startEvent?.payload.run;
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
    runId,
    shadowSessionId: runFromStart?.shadowSessionId,
    agenda: runFromStart?.agenda ?? "",
    topics: runFromStart?.topics ?? [],
    agendaItems: runFromStart?.agendaItems ?? [],
    personaIds: runFromStart?.personaIds ?? [],
    meetingId: runFromStart?.meetingId,
    documentIds: runFromStart?.documentIds ?? [],
    controls: runFromStart?.controls,
    meetingArtifacts: runFromStart?.meetingArtifacts ?? [],
    outputFormat: runFromStart?.outputFormat ?? "markdown",
    targetWordCount: runFromStart?.targetWordCount ?? 600,
    sharedTranscript: transcript,
    turnMeta,
    firstSpeakerPersonaId: firstSpeaker,
    skippedPersonaIds: runFromStart?.skippedPersonaIds ?? [],
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

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  let run: ShadowBoardRun | undefined = await getShadowBoardRun(runId);

  if (!run) {
    const events = await getShadowBoardRunEvents(runId, 5000);
    run = rehydrateRunFromEvents(runId, events) ?? undefined;
  }

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  return jsonOk({
    runId: run.runId,
    status: run.status,
    agenda: run.agenda,
    topics: run.topics,
    firstSpeakerPersonaId: run.firstSpeakerPersonaId,
    skippedPersonaIds: run.skippedPersonaIds ?? [],
    warnings: run.warnings ?? [],
    sharedTranscript: run.sharedTranscript ?? [],
    turnMeta: run.turnMeta ?? [],
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    activeStage: run.activeStage ?? "planning",
    lastHeartbeatAt: run.lastHeartbeatAt,
    lastCompletedTurn: run.lastCompletedTurn ?? 0,
    failureCode: run.failureCode,
    failureDetail: run.failureDetail,
    outputFormat: run.outputFormat ?? "markdown",
    targetWordCount: run.targetWordCount ?? 600,
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
  });
}
