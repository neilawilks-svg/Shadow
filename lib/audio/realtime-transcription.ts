export interface RealtimeTranscriptionConfig {
  type: "transcription_session.update";
  input_audio_format: "pcm16";
  input_audio_transcription: {
    model: string;
    prompt: string;
    language: string;
  };
  turn_detection: {
    type: "server_vad";
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
  input_audio_noise_reduction: {
    type: "near_field" | "far_field";
  };
  include: string[];
}

export interface RealtimeGaTranscriptionSessionConfig {
  type: "transcription";
  audio: {
    input: {
      format: {
        type: "audio/pcm";
        rate: 24000;
      };
      transcription: {
        model: string;
        prompt: string;
        language: string;
      };
      turn_detection: {
        type: "server_vad";
        threshold: number;
        prefix_padding_ms: number;
        silence_duration_ms: number;
      };
      noise_reduction: {
        type: "near_field" | "far_field";
      };
    };
  };
  include: string[];
}

export interface RealtimeGaSessionUpdateEvent {
  type: "session.update";
  session: RealtimeGaTranscriptionSessionConfig;
}

export function buildRealtimeTranscriptionConfig(model: string): RealtimeTranscriptionConfig {
  return {
    type: "transcription_session.update",
    input_audio_format: "pcm16",
    input_audio_transcription: {
      model,
      prompt: "",
      language: "en",
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
    input_audio_noise_reduction: {
      type: "near_field",
    },
    include: ["item.input_audio_transcription.logprobs"],
  };
}

export function buildRealtimeGaTranscriptionSessionConfig(
  model: string,
  language = "en",
): RealtimeGaTranscriptionSessionConfig {
  return {
    type: "transcription",
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        transcription: {
          model,
          prompt: "",
          language,
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        noise_reduction: {
          type: "near_field",
        },
      },
    },
    include: ["item.input_audio_transcription.logprobs"],
  };
}

export function buildRealtimeGaSessionUpdateEvent(
  model: string,
  language = "en",
): RealtimeGaSessionUpdateEvent {
  return {
    type: "session.update",
    session: buildRealtimeGaTranscriptionSessionConfig(model, language),
  };
}
