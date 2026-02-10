import { subscribeMeetingEvents } from "@/lib/events/meeting-event-bus";
import { jsonError } from "@/lib/http";
import { getHandRaiseEventsBySession } from "@/lib/store/repository";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;

  if (!sessionId) {
    return jsonError("Session id is required.", 400);
  }

  const history = await getHandRaiseEventsBySession(sessionId);
  const encoder = new TextEncoder();

  let teardown: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      history
        .slice()
        .reverse()
        .forEach((event) => send({ type: "history", event }));

      const unsubscribe = subscribeMeetingEvents(sessionId, (event) => {
        send({ type: "hand_raise", event });
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
