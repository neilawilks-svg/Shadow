import { z } from "zod";

import { jsonCreated, jsonError, jsonOk } from "@/lib/http";
import { createMeetingSession, listMeetingSessions } from "@/lib/store/repository";

const schema = z.object({
  title: z.string().min(1).max(140),
  consentAccepted: z.boolean(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid meeting session payload.", 400, parsed.error.flatten());
  }

  if (!parsed.data.consentAccepted) {
    return jsonError("Consent acceptance is required before meeting capture starts.", 400);
  }

  const session = await createMeetingSession(parsed.data);
  return jsonCreated(session);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

  if (!Number.isFinite(limit) || limit <= 0) {
    return jsonError("Invalid limit.", 400);
  }

  const sessions = await listMeetingSessions(Math.min(limit, 500));
  return jsonOk({
    sessions: sessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      updatedAt: session.updatedAt,
      linkedDocumentIds: session.linkedDocumentIds ?? [],
      transcriptCount: session.transcriptSegmentIds?.length ?? 0,
      morganResponseCount: session.morganResponses?.length ?? 0,
    })),
  });
}
