import type { AgendaItem, ShadowBoardTurnMeta } from "@/types/domain";

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

function parseTurnIndex(line: string): number | null {
  const match = line.match(/^\[Turn\s+(\d+)\]/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function buildAgendaItemsForReport(params: {
  runAgenda: string;
  runTopics: string[];
  agendaItems?: AgendaItem[];
}): AgendaItem[] {
  if (Array.isArray(params.agendaItems) && params.agendaItems.length > 0) {
    return params.agendaItems;
  }
  return [
    {
      id: "agenda-item-1",
      title: params.runTopics[0] ?? params.runAgenda ?? "Agenda",
      timePercent: 100,
      detailedDescription: params.runAgenda ?? "",
      desiredOutput: params.runAgenda ?? "",
      questions: params.runTopics.slice(1),
    },
  ];
}

function buildTurnMetaFallback(lines: string[], agendaItemId: string, topic: string): ShadowBoardTurnMeta[] {
  return lines
    .map((line) => parseTurnIndex(line))
    .filter((value): value is number => typeof value === "number")
    .map((turnIndex) => ({
      turnIndex,
      agendaItemId,
      topic,
    }));
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

  const agendaItems = buildAgendaItemsForReport({
    runAgenda: run.agenda,
    runTopics: run.topics,
    agendaItems: run.agendaItems,
  });

  const transcriptLines = run.sharedTranscript ?? [];
  const turnMeta =
    (run.turnMeta ?? []).length > 0
      ? run.turnMeta ?? []
      : buildTurnMetaFallback(transcriptLines, agendaItems[0]?.id ?? "agenda-item-1", agendaItems[0]?.title ?? run.agenda);
  const transcriptByTurn = new Map<number, string>();
  for (const line of transcriptLines) {
    const turnIndex = parseTurnIndex(line);
    if (turnIndex !== null) {
      transcriptByTurn.set(turnIndex, line);
    }
  }

  const sections: string[] = [];
  sections.push(`# Shadow Board Report (${run.runId})`);
  sections.push("");
  sections.push("## Agenda Overview");
  sections.push(...agendaItems.map((item, index) => `- **${index + 1}. ${item.title}** - ${item.timePercent}% | planned turns: ${item.plannedTurns ?? 0}`));
  sections.push("");
  sections.push("## Consensus");
  sections.push(run.consensusSummary || "No consensus summary available.");
  sections.push("");
  sections.push("## Dissent");
  sections.push(run.dissentSummary || "No dissent summary available.");
  sections.push("");

  for (let i = 0; i < agendaItems.length; i += 1) {
    const item = agendaItems[i]!;
    const itemMeta = turnMeta.filter((entry) => entry.agendaItemId === item.id);
    const itemTurnLines = itemMeta
      .map((entry) => transcriptByTurn.get(entry.turnIndex))
      .filter((line): line is string => Boolean(line));
    const itemRecommendations = run.recommendations
      .filter((rec) => rec.theme.toLowerCase().includes(item.title.toLowerCase()) || rec.recommendation.toLowerCase().includes(item.title.toLowerCase()))
      .slice(0, 4);

    sections.push(`## Agenda Item ${i + 1}: ${item.title} (${item.timePercent}%)`);
    sections.push("");
    sections.push("### Detailed Description");
    sections.push(item.detailedDescription || "No detailed description provided.");
    sections.push("");
    sections.push("### Desired Output");
    sections.push(item.desiredOutput || "No desired output specified.");
    sections.push("");
    sections.push("### Questions");
    sections.push(...(item.questions.length > 0 ? item.questions.map((question) => `- ${question}`) : ["- none provided"]));
    sections.push("");
    sections.push("### Discussion Highlights");
    sections.push(...(itemTurnLines.length > 0 ? itemTurnLines.slice(0, 8).map((line) => `- ${line}`) : ["- No turns mapped to this agenda item."]));
    sections.push("");
    sections.push("### Recommendations");
    sections.push(
      ...(itemRecommendations.length > 0
        ? itemRecommendations.map(
            (recommendation) =>
              `- **${recommendation.theme}**: ${recommendation.recommendation} (confidence: ${Math.round(recommendation.confidence * 100)}%)`,
          )
        : run.recommendations.length > 0
          ? run.recommendations
              .slice(0, 3)
              .map(
                (recommendation) =>
                  `- **${recommendation.theme}**: ${recommendation.recommendation} (confidence: ${Math.round(
                    recommendation.confidence * 100,
                  )}%)`,
              )
          : ["- no recommendations recorded"]),
    );
    sections.push("");
    sections.push("### Transcript Excerpt");
    sections.push(...toTranscriptBullets(itemTurnLines.length > 0 ? itemTurnLines : transcriptLines.slice(0, 10)));
    sections.push("");
  }

  sections.push("## Meeting Artifacts");
  sections.push(
    ...(run.meetingArtifacts && run.meetingArtifacts.length > 0
      ? run.meetingArtifacts.map((artifact) => `- ${artifact}`)
      : ["- none provided"]),
  );
  sections.push("");
  sections.push("## Full Transcript");
  sections.push(...toTranscriptBullets(transcriptLines));

  const markdownRaw = sections.join("\n");
  const target = run.targetWordCount ?? 600;
  const markdown = markdownRaw;
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
