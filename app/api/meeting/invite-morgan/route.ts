import { z } from "zod";

import { generateInvitedMorganResponse } from "@/lib/agents/invite-morgan";
import { jsonOk, jsonError } from "@/lib/http";

const schema = z.object({
  sessionId: z.string().min(1),
  question: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid invite payload.", 400, parsed.error.flatten());
  }

  const response = await generateInvitedMorganResponse(parsed.data.sessionId, parsed.data.question);
  return jsonOk({ response });
}
