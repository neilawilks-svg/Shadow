import { z } from "zod";

import { processPersonaInterviewTurn } from "@/lib/agents/persona-interview";
import { jsonOk, jsonError } from "@/lib/http";

const schema = z.object({
  answer: z.string().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid interview turn payload.", 400, parsed.error.flatten());
  }

  try {
    const interview = await processPersonaInterviewTurn(id, parsed.data.answer);
    return jsonOk(interview);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Interview update failed.", 404);
  }
}
