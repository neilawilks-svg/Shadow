import type { SessionTranscriptExport, TranscriptSegment } from "@/types/domain";

function toSrtTime(date: Date): string {
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const millis = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds},${millis}`;
}

function escapeSrtText(input: string): string {
  return input.replace(/\r?\n+/g, " ").trim();
}

export function buildTranscriptExport(
  sessionId: string,
  format: "md" | "json" | "srt",
  segments: TranscriptSegment[],
): SessionTranscriptExport {
  const generatedAt = new Date().toISOString();

  if (format === "json") {
    return {
      sessionId,
      format,
      fileName: `${sessionId}-transcript.json`,
      contentType: "application/json",
      body: `${JSON.stringify({ sessionId, generatedAt, segments }, null, 2)}\n`,
      generatedAt,
    };
  }

  if (format === "srt") {
    const blocks: string[] = [];
    let lineNumber = 1;

    for (const segment of segments) {
      const startedAt = new Date(segment.startedAt);
      const endedAt = new Date(segment.endedAt);
      if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
        continue;
      }

      const safeEnd = endedAt.getTime() <= startedAt.getTime() ? new Date(startedAt.getTime() + 1) : endedAt;
      blocks.push(
        [
          String(lineNumber),
          `${toSrtTime(startedAt)} --> ${toSrtTime(safeEnd)}`,
          `${segment.speaker}: ${escapeSrtText(segment.text)}`,
        ].join("\n"),
      );
      lineNumber += 1;
    }

    return {
      sessionId,
      format,
      fileName: `${sessionId}-transcript.srt`,
      contentType: "application/x-subrip",
      body: `${blocks.join("\n\n")}\n`,
      generatedAt,
    };
  }

  const markdown = [
    `# Meeting Transcript (${sessionId})`,
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Segments",
    ...segments.map(
      (segment) =>
        `- **${new Date(segment.endedAt).toLocaleString()}** \`${segment.speaker}\`: ${segment.text.replace(/\r?\n+/g, " ").trim()}`,
    ),
    "",
  ].join("\n");

  return {
    sessionId,
    format,
    fileName: `${sessionId}-transcript.md`,
    contentType: "text/markdown",
    body: markdown,
    generatedAt,
  };
}
