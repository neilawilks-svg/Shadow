import { buildTranscriptExport } from "@/lib/meeting/transcript-export";
import { jsonError } from "@/lib/http";
import { getMeetingSession, getTranscriptSegmentsBySession } from "@/lib/store/repository";

const ACCEPTED_FORMATS = new Set(["md", "json", "srt"]);

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return jsonError("Meeting session not found.", 404);
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "md").toLowerCase();
  if (!ACCEPTED_FORMATS.has(format)) {
    return jsonError("Invalid export format. Use md, json, or srt.", 400);
  }

  const segments = await getTranscriptSegmentsBySession(sessionId);
  const transcriptExport = buildTranscriptExport(sessionId, format as "md" | "json" | "srt", segments);

  return new Response(transcriptExport.body, {
    headers: {
      "Content-Type": transcriptExport.contentType,
      "Content-Disposition": `attachment; filename=\"${transcriptExport.fileName}\"`,
    },
  });
}
