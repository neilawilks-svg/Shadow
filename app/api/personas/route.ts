import { z } from "zod";

import { jsonCreated, jsonError, jsonOk } from "@/lib/http";
import { getPersonas, savePersona } from "@/lib/store/repository";

const schema = z.object({
  name: z.string().min(1),
  role: z.enum(["board_member", "slalom_facilitator"]).default("board_member"),
  lens: z.string().min(1),
  values: z.array(z.string()).min(1),
  riskPosture: z.enum(["risk_averse", "balanced", "risk_tolerant"]),
  decisionStyle: z.string().min(1),
  challengeStyle: z.string().min(1),
  horizon: z.enum(["short", "medium", "long"]),
  promptTemplate: z.string().min(1),
  personaPdfUrl: z.string().url().optional(),
  personaPdfFileName: z.string().min(1).max(240).optional(),
});

export async function GET() {
  const personas = await getPersonas();
  return jsonOk({ personas });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid persona payload.", 400, parsed.error.flatten());
  }

  const persona = await savePersona({
    ...parsed.data,
    fixed: false,
  });

  return jsonCreated({ persona });
}
