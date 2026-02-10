import { NextRequest } from "next/server";

import { config } from "@/lib/config";
import { jsonError, jsonOk } from "@/lib/http";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!config.openAiApiKey) {
    return jsonError("OPENAI_API_KEY is not configured.", 500);
  }

  const body = await request.json().catch(() => ({}));
  const voice = body.voice ?? "marin";

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: body.type ?? "transcription",
          model: body.model ?? "gpt-realtime",
          audio:
            body.type === "realtime"
              ? {
                  output: { voice },
                }
              : undefined,
          input_audio_transcription: {
            model: config.modelTranscribe,
            language: body.language ?? "en",
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonError("Failed to create realtime client secret.", response.status, data);
    }

    return jsonOk(data);
  } catch (error) {
    logError("Realtime client secret request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("Unable to create realtime client secret.", 500);
  }
}
