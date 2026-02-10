import { z } from "zod";

import { jsonCreated, jsonError } from "@/lib/http";
import { createMeetingSession } from "@/lib/store/repository";

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
