import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/http";
import {
  attachDocumentsToSession,
  getHandRaiseEventsBySession,
  getMeetingSession,
  getMorganResponsesBySession,
  getTranscriptSegmentsBySession,
} from "@/lib/store/repository";

const patchSchema = z.object({
  documentIds: z.array(z.string()).max(500).optional(),
});

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return jsonError("Meeting session not found.", 404);
  }

  const [segments, handRaises, morganResponses] = await Promise.all([
    getTranscriptSegmentsBySession(sessionId),
    getHandRaiseEventsBySession(sessionId),
    getMorganResponsesBySession(sessionId),
  ]);

  return jsonOk({
    session,
    transcriptSegments: segments,
    handRaises,
    morganResponses,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return jsonError("Meeting session not found.", 404);
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("Invalid meeting session update payload.", 400, parsed.error.flatten());
  }

  const updatedSession =
    parsed.data.documentIds && parsed.data.documentIds.length > 0
      ? await attachDocumentsToSession(sessionId, parsed.data.documentIds)
      : session;

  return jsonOk({
    session: updatedSession ?? session,
  });
}
