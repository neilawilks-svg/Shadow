export const config = {
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  modelTranscribe: process.env.MODEL_TRANSCRIBE ?? "gpt-4o-mini-transcribe",
  modelMonitor: process.env.MODEL_MONITOR ?? "gpt-4.1-mini",
  modelPersonaSynthesis: process.env.MODEL_PERSONA_SYNTHESIS ?? "gpt-4.1",
  modelShadowBoard: process.env.MODEL_SHADOW_BOARD ?? "gpt-4.1",
  persistTranscripts: (process.env.PERSIST_TRANSCRIPTS ?? "false") === "true",
  persistRawAudio: (process.env.PERSIST_RAW_AUDIO ?? "false") === "true",
  enableRedaction: (process.env.ENABLE_REDACTION ?? "true") === "true",
};
