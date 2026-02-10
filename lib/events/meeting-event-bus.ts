import type { HandRaiseEvent } from "@/types/domain";

type Subscriber = (event: HandRaiseEvent) => void;

declare global {
  var __meetingEventSubscribers: Map<string, Set<Subscriber>> | undefined;
}

const subscribers = globalThis.__meetingEventSubscribers ?? new Map<string, Set<Subscriber>>();
globalThis.__meetingEventSubscribers = subscribers;

export function publishMeetingEvent(sessionId: string, event: HandRaiseEvent): void {
  const bucket = subscribers.get(sessionId);
  if (!bucket) {
    return;
  }

  for (const notify of bucket) {
    notify(event);
  }
}

export function subscribeMeetingEvents(sessionId: string, callback: Subscriber): () => void {
  const bucket = subscribers.get(sessionId) ?? new Set<Subscriber>();
  bucket.add(callback);
  subscribers.set(sessionId, bucket);

  return () => {
    const current = subscribers.get(sessionId);
    if (!current) {
      return;
    }
    current.delete(callback);
    if (current.size === 0) {
      subscribers.delete(sessionId);
    }
  };
}
