import { z } from "zod";

import { startShadowBoardRun } from "@/lib/agents/shadow-board";
import { jsonCreated, jsonError } from "@/lib/http";

const schema = z.object({
  agenda: z.string().min(1),
  topics: z.array(z.string()).min(1),
  personaIds: z.array(z.string()).min(1).max(12),
  meetingArtifacts: z.array(z.string()).max(24).optional().default([]),
  transcriptSeed: z.array(z.string()).max(60).optional().default([]),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid shadow board run payload.", 400, parsed.error.flatten());
  }

  const run = await startShadowBoardRun(parsed.data);
  return jsonCreated(run);
}
