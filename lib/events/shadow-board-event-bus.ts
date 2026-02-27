import type { ShadowBoardRunEvent } from "@/types/domain";

import { appendShadowBoardRunEvent } from "@/lib/store/repository";

type Subscriber = (event: ShadowBoardRunEvent) => void;

declare global {
  var __shadowBoardEventSubscribers: Map<string, Set<Subscriber>> | undefined;
}

const subscribers = globalThis.__shadowBoardEventSubscribers ?? new Map<string, Set<Subscriber>>();
globalThis.__shadowBoardEventSubscribers = subscribers;

export async function publishShadowBoardEvent(event: ShadowBoardRunEvent): Promise<void> {
  await appendShadowBoardRunEvent(event);
  const bucket = subscribers.get(event.runId);
  if (!bucket) {
    return;
  }

  for (const notify of bucket) {
    notify(event);
  }
}

export function subscribeShadowBoardEvents(runId: string, callback: Subscriber): () => void {
  const bucket = subscribers.get(runId) ?? new Set<Subscriber>();
  bucket.add(callback);
  subscribers.set(runId, bucket);

  return () => {
    const current = subscribers.get(runId);
    if (!current) {
      return;
    }
    current.delete(callback);
    if (current.size === 0) {
      subscribers.delete(runId);
    }
  };
}
