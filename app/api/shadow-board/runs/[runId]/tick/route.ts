import { tickShadowBoardRun } from "@/lib/agents/shadow-board";
import { jsonOk } from "@/lib/http";
import { rehydrateRunFromEvents } from "@/lib/agents/shadow-run-rehydrate";
import { getShadowBoardRunEvents, updateShadowBoardRun } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  let run = await tickShadowBoardRun(runId);
  if (!run) {
    const events = await getShadowBoardRunEvents(runId, 5000);
    const recovered = rehydrateRunFromEvents(runId, events);
    if (recovered) {
      await updateShadowBoardRun(recovered);
      run = await tickShadowBoardRun(runId);
    }
  }
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
