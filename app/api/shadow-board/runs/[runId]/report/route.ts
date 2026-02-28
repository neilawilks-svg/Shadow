import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimToWordTarget(text: string, targetWordCount: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= targetWordCount) {
    return text;
  }

  const tokens = text.match(/\S+|\s+/g) ?? [];
  let seenWords = 0;
  let output = "";

  for (const token of tokens) {
    if (/\s+/.test(token)) {
      output += token;
      continue;
    }
    if (seenWords >= targetWordCount) {
      break;
    }
    output += token;
    seenWords += 1;
  }

  return `${output.trimEnd()}...`;
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\-\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toTranscriptBullets(lines: string[]): string[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    return ["- transcript unavailable"];
  }

  return lines.map((line, index) => {
    const cleaned = line.trim();
    const match = cleaned.match(/^\[Turn\s+(\d+)\]\s*(.+)$/i);
    if (match) {
      const turnNumber = match[1];
      const body = match[2] ?? "";
      const linesInTurn = body.split(/\r?\n/);
      const speakerMatch = linesInTurn[0]?.match(/^([^:]+):\s*(.*)$/);
      if (!speakerMatch) {
        return `- **Turn ${turnNumber}:** ${body.replace(/\r?\n/g, " ")}`;
      }
      const speaker = speakerMatch[1]?.trim() ?? "Speaker";
      const firstLine = speakerMatch[2]?.trim() ?? "";
      const detailLines = linesInTurn.slice(1).map((item) => item.trim()).filter(Boolean);
      const details = detailLines.length > 0 ? `\n  ${detailLines.join("\n  ")}` : "";
      return `- **Turn ${turnNumber} - ${speaker}:** ${firstLine}${details}`;
    }

    const fallbackSpeaker = cleaned.match(/^([^:]+):\s*(.*)$/);
    if (fallbackSpeaker) {
      const speaker = fallbackSpeaker[1]?.trim() ?? "Speaker";
      const text = fallbackSpeaker[2]?.trim() ?? "";
      return `- **${index + 1}. ${speaker}:** ${text}`;
    }

    return `- **${index + 1}.** ${cleaned}`;
  });
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
    "## Full Transcript",
    ...toTranscriptBullets(run.sharedTranscript ?? []),
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
