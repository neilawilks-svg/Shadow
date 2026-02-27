import { basename } from "node:path";

import { readSpeechClip } from "@/lib/audio/tts";
import { jsonError } from "@/lib/http";

export async function GET(_: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const safeName = basename(fileName);
  const bytes = await readSpeechClip(safeName);
  if (!bytes) {
    return jsonError("Audio clip not found.", 404);
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
