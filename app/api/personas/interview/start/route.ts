import { z } from "zod";

import { startPersonaInterview } from "@/lib/agents/persona-interview";
import { jsonCreated, jsonError } from "@/lib/http";

const schema = z.object({
  personaName: z.string().min(1),
  focusArea: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid interview start payload.", 400, parsed.error.flatten());
  }

  const interview = await startPersonaInterview(parsed.data.personaName, parsed.data.focusArea);
  return jsonCreated(interview);
}
