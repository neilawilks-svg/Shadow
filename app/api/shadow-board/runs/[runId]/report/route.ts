import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun } from "@/lib/store/repository";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await getShadowBoardRun(runId);

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  const markdown = [
    `# Shadow Board Report (${run.runId})`,
    "",
    "## Agenda",
    run.agenda,
    "",
    "## Topics",
    ...run.topics.map((topic) => `- ${topic}`),
    "",
    "## Meeting Artifacts",
    ...(run.meetingArtifacts && run.meetingArtifacts.length > 0
      ? run.meetingArtifacts.map((artifact) => `- ${artifact}`)
      : ["- none provided"]),
    "",
    "## Consensus",
    run.consensusSummary,
    "",
    "## Dissent",
    run.dissentSummary,
    "",
    "## Recommendations",
    ...run.recommendations.map(
      (item) =>
        `- **${item.theme}**: ${item.recommendation} (confidence: ${Math.round(item.confidence * 100)}%)`,
    ),
    "",
    "## Shared Transcript (excerpt)",
    ...(run.sharedTranscript && run.sharedTranscript.length > 0
      ? run.sharedTranscript.slice(-30).map((line) => `- ${line}`)
      : ["- transcript unavailable"]),
  ].join("\n");

  return jsonOk({ markdown, run });
}
