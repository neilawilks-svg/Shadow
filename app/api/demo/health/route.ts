import { config } from "@/lib/config";
import { jsonOk } from "@/lib/http";

export async function GET() {
  return jsonOk({
    apiKeyConfigured: Boolean(config.openAiApiKey),
    models: {
      transcribe: config.modelTranscribe,
      monitor: config.modelMonitor,
      personaSynthesis: config.modelPersonaSynthesis,
      shadowBoard: config.modelShadowBoard,
    },
    dataPolicy: {
      persistTranscripts: config.persistTranscripts,
      persistRawAudio: config.persistRawAudio,
      redactionEnabled: config.enableRedaction,
    },
    checkedAt: new Date().toISOString(),
  });
}
