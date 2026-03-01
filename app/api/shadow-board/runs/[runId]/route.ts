import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun, getShadowBoardRunEvents, updateShadowBoardRun } from "@/lib/store/repository";
import type { ShadowBoardRun } from "@/types/domain";
import { rehydrateRunFromEvents } from "@/lib/agents/shadow-run-rehydrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  let run: ShadowBoardRun | undefined = await getShadowBoardRun(runId);

  if (!run) {
    const events = await getShadowBoardRunEvents(runId, 5000);
    const recovered = rehydrateRunFromEvents(runId, events);
    if (recovered) {
      await updateShadowBoardRun(recovered);
      run = recovered;
    }
  }

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  if (run.status === "running" && run.lastHeartbeatAt) {
    const ageMs = Date.now() - new Date(run.lastHeartbeatAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > 900_000) {
      run.status = "failed";
      run.finishedAt = new Date().toISOString();
      run.failureCode = run.failureCode ?? "WORKER_STALLED";
      run.failureDetail = run.failureDetail ?? "No run heartbeat was received for more than 15 minutes.";
      run.error = run.failureDetail;
      await updateShadowBoardRun(run);
    }
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
    error: run.error,
    outputFormat: run.outputFormat ?? "markdown",
    targetWordCount: run.targetWordCount ?? 600,
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
  });
}
