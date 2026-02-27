import { z } from "zod";

import { startShadowBoardRunAsync } from "@/lib/agents/shadow-board";
import { jsonCreated, jsonError, jsonOk } from "@/lib/http";
import { listShadowBoardRuns } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  agenda: z.string().min(1),
  topics: z.array(z.string()).max(20).optional().default([]),
  personaIds: z.array(z.string()).min(1).max(40),
  meetingId: z.string().optional(),
  shadowSessionId: z.string().min(1).max(120).optional(),
  documentIds: z.array(z.string()).max(100).optional().default([]),
  reasoningLevel: z.number().min(1).max(10).optional().default(6),
  maxConversationTurns: z.number().int().min(3).max(80).optional().default(24),
  randomness: z.number().min(0).max(1).optional().default(0.2),
  meetingArtifacts: z.array(z.string()).max(24).optional().default([]),
  outputFormat: z.enum(["markdown", "plain_text"]).optional().default("markdown"),
  targetWordCount: z.number().int().min(150).max(2000).optional().default(600),
  transcriptSeed: z.array(z.string()).max(60).optional().default([]),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid shadow board run payload.", 400, parsed.error.flatten());
  }

  const run = await startShadowBoardRunAsync(parsed.data);
  return jsonCreated(run);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return jsonError("Invalid limit.", 400);
  }

  const runs = await listShadowBoardRuns(Math.min(limit, 500));
  return jsonOk({ runs });
}
