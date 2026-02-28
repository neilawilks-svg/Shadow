import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await getShadowBoardRun(runId);

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
    outputFormat: run.outputFormat ?? "markdown",
    targetWordCount: run.targetWordCount ?? 600,
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
  });
}
