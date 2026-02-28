import { tickShadowBoardRun } from "@/lib/agents/shadow-board";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await tickShadowBoardRun(runId);
  if (!run) {
    return jsonError("Shadow board run not found.", 404);
  }
  return jsonOk(run);
}
