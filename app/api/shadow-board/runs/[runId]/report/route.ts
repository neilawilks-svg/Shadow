import { jsonError, jsonOk } from "@/lib/http";
import { getShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return lines.map((line) => `- ${line.trim()}`);
}

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await getShadowBoardRun(runId);

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  const sections: string[] = [];
  sections.push(`# Shadow Board Transcript (${run.runId})`);
  sections.push("");
  sections.push("## Agenda");
  sections.push(run.agenda);
  sections.push("");
  sections.push("## Full Transcript");
  sections.push(...toTranscriptBullets(run.sharedTranscript ?? []));

  const markdown = sections.join("\n");
  const plainText = toPlainText(markdown);

  return jsonOk({
    format: "markdown",
    targetWordCount: run.targetWordCount ?? 0,
    markdown,
    plainText,
    content: markdown,
    run: {
      runId: run.runId,
      status: run.status,
      agenda: run.agenda,
      topics: run.topics,
      sharedTranscript: run.sharedTranscript ?? [],
    },
  });
}
