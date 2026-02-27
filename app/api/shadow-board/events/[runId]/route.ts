import { subscribeShadowBoardEvents } from "@/lib/events/shadow-board-event-bus";
import { jsonError } from "@/lib/http";
import { getShadowBoardRunEvents } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  if (!runId) {
    return jsonError("Run id is required.", 400);
  }

  const history = await getShadowBoardRunEvents(runId, 800);
  const encoder = new TextEncoder();

  let teardown: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      for (const event of history) {
        send(event);
      }

      const unsubscribe = subscribeShadowBoardEvents(runId, (event) => {
        send(event);
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: ${Date.now()}\n\n`));
      }, 15000);

      teardown = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      teardown?.();
      teardown = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
