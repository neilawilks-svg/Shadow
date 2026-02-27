import { jsonError } from "@/lib/http";
import { generateTranscriptPdf } from "@/lib/pdf/transcript-pdf";
import { getShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "")
    .slice(0, 80);
}

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await getShadowBoardRun(runId);

  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }

  const pdfBytes = generateTranscriptPdf({
    runId: run.runId,
    agenda: run.agenda,
    topics: run.topics ?? [],
    transcriptLines: run.sharedTranscript ?? [],
  });

  const fileStem = sanitizeFilePart(run.runId) || "shadow-board-run";
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileStem}-transcript.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
