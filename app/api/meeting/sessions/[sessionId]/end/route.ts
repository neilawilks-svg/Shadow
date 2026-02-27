import { jsonError, jsonOk } from "@/lib/http";
import { endMeetingSession } from "@/lib/store/repository";

export async function POST(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const session = await endMeetingSession(sessionId);

  if (!session) {
    return jsonError("Meeting session not found.", 404);
  }

  return jsonOk({ session });
}
