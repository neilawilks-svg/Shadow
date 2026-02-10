import { NextRequest } from "next/server";

import { buildRealtimeGaTranscriptionSessionConfig } from "@/lib/audio/realtime-transcription";
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
  const type = body.type === "realtime" ? "realtime" : "transcription";
  const language = body.language ?? "en";
  const transcribeModel = body.transcriptionModel ?? config.modelTranscribe;

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          ...(type === "realtime"
            ? {
                type: "realtime",
                model: body.model ?? "gpt-realtime",
                audio: {
                  output: { voice },
                },
              }
            : buildRealtimeGaTranscriptionSessionConfig(transcribeModel, language)),
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonError("Failed to create realtime client secret.", response.status, data);
    }

    const token =
      (typeof data?.value === "string" ? data.value : null) ??
      (typeof data?.client_secret?.value === "string" ? data.client_secret.value : null);

    return jsonOk({
      ...data,
      value: token,
      type,
      transcriptionModel: data?.session?.audio?.input?.transcription?.model ?? transcribeModel,
      transcriptionLanguage: data?.session?.audio?.input?.transcription?.language ?? language,
    });
  } catch (error) {
    logError("Realtime client secret request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("Unable to create realtime client secret.", 500);
  }
}
