import { randomUUID } from "node:crypto";

import { z } from "zod";

import { evaluateAndMaybeRaiseHand } from "@/lib/agents/monitor";
import { jsonCreated, jsonError } from "@/lib/http";
import { redactSensitiveText } from "@/lib/redaction/redact";
import { appendTranscriptSegment } from "@/lib/store/repository";
import type { TranscriptSegment } from "@/types/domain";

const schema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1),
  speaker: z.string().default("speaker"),
  confidence: z.number().min(0).max(1).default(0.8),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid transcript segment payload.", 400, parsed.error.flatten());
  }

  const now = new Date().toISOString();
  const redaction = redactSensitiveText(parsed.data.text);

  const segment: TranscriptSegment = {
    sessionId: parsed.data.sessionId,
    segmentId: `segment-${randomUUID()}`,
    text: redaction.redactedText,
    speaker: parsed.data.speaker,
    confidence: parsed.data.confidence,
    startedAt: parsed.data.startedAt ?? now,
    endedAt: parsed.data.endedAt ?? now,
  };

  await appendTranscriptSegment(segment);
  const candidate = await evaluateAndMaybeRaiseHand(parsed.data.sessionId);

  return jsonCreated({
    segment,
    redaction,
    candidate,
  });
}
