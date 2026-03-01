import { tickShadowBoardRun } from "@/lib/agents/shadow-board";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = await tickShadowBoardRun(runId);
  if (!run) {
    return jsonOk(
      {
        accepted: true,
        status: "queued",
        message: "Run state not visible yet. Tick accepted; retrying shortly.",
      },
      { status: 202 },
    );
  }
  return jsonOk(run);
}
