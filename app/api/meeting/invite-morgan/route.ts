import { z } from "zod";
import { basename } from "node:path";

import { generateInvitedMorganResponse } from "@/lib/agents/invite-morgan";
import { synthesizeSpeechClip } from "@/lib/audio/tts";
import { jsonOk, jsonError } from "@/lib/http";
import { appendMorganResponse } from "@/lib/store/repository";

const schema = z.object({
  sessionId: z.string().min(1),
  question: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return jsonError("Invalid invite payload.", 400, parsed.error.flatten());
  }

  const response = await generateInvitedMorganResponse(parsed.data.sessionId, parsed.data.question);
  const speech = await synthesizeSpeechClip({
    text: response,
    sessionId: parsed.data.sessionId,
  }).catch(() => null);

  const stored = await appendMorganResponse(parsed.data.sessionId, {
    text: response,
    question: parsed.data.question,
    audioPath: speech?.audioPath,
    autoplay: true,
  });

  const audioUrl = speech?.audioPath
    ? `/api/meeting/audio/${encodeURIComponent(basename(speech.audioPath))}`
    : null;

  return jsonOk({
    response,
    morganResponse: stored,
    audio: speech
      ? {
          clipId: speech.clipId,
          audioPath: speech.audioPath,
          audioUrl,
        }
      : null,
  });
}
