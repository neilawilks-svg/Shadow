import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimToWordTarget(text: string, targetWordCount: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= targetWordCount) {
    return text;
  }
  return `${words.slice(0, targetWordCount).join(" ")}...`;
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\-\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await getShadowBoardRun(runId);

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  const markdownRaw = [
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
  const target = run.targetWordCount ?? 600;
  const markdown = trimToWordTarget(markdownRaw, target);
  const plainText = trimToWordTarget(toPlainText(markdownRaw), target);

  return jsonOk({
    format: run.outputFormat ?? "markdown",
    targetWordCount: target,
    markdown,
    plainText,
    content: (run.outputFormat ?? "markdown") === "plain_text" ? plainText : markdown,
    run,
  });
}
