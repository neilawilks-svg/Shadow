import { describe, expect, it } from "vitest";

import {
  buildRealtimeGaSessionUpdateEvent,
  buildRealtimeGaTranscriptionSessionConfig,
  buildRealtimeTranscriptionConfig,
} from "@/lib/audio/realtime-transcription";

describe("realtime transcription config", () => {
  it("builds pcm16 server_vad config", () => {
    const config = buildRealtimeTranscriptionConfig("gpt-4o-mini-transcribe");

    expect(config.input_audio_format).toBe("pcm16");
    expect(config.turn_detection.type).toBe("server_vad");
    expect(config.input_audio_transcription.model).toBe("gpt-4o-mini-transcribe");
  });

  it("builds GA transcription session config for client secret flow", () => {
    const config = buildRealtimeGaTranscriptionSessionConfig("gpt-4o-mini-transcribe", "en");

    expect(config.type).toBe("transcription");
    expect(config.audio.input.format.type).toBe("audio/pcm");
    expect(config.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(config.audio.input.turn_detection.type).toBe("server_vad");
  });

  it("builds GA session.update event shape", () => {
    const update = buildRealtimeGaSessionUpdateEvent("gpt-4o-mini-transcribe", "en");

    expect(update.type).toBe("session.update");
    expect(update.session.type).toBe("transcription");
    expect(update.session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
  });
});
