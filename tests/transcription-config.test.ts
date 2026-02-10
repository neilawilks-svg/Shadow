import { describe, expect, it } from "vitest";

import { buildRealtimeTranscriptionConfig } from "@/lib/audio/realtime-transcription";

describe("realtime transcription config", () => {
  it("builds pcm16 server_vad config", () => {
    const config = buildRealtimeTranscriptionConfig("gpt-4o-mini-transcribe");

    expect(config.input_audio_format).toBe("pcm16");
    expect(config.turn_detection.type).toBe("server_vad");
    expect(config.input_audio_transcription.model).toBe("gpt-4o-mini-transcribe");
  });
});
