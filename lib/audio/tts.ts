import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "@/lib/config";
import { getOpenAiClient, hasOpenAiKey } from "@/lib/openai/client";

export interface TtsClip {
  clipId: string;
  audioPath: string;
}

const AUDIO_DIR = path.join(process.cwd(), "local", "audio-clips");

async function ensureAudioDir(): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function synthesizeSpeechClip(input: {
  text: string;
  sessionId: string;
  clipId?: string;
}): Promise<TtsClip | null> {
  const text = input.text.trim();
  if (!text || !hasOpenAiKey()) {
    return null;
  }

  await ensureAudioDir();
  const clipId = input.clipId ?? `tts-${randomUUID()}`;
  const fileName = `${input.sessionId}-${clipId}.mp3`;
  const audioPath = path.join(AUDIO_DIR, fileName);

  const response = await getOpenAiClient().audio.speech.create({
    input: text.slice(0, 4096),
    model: config.modelTextToSpeech,
    voice: config.boardAgentVoice,
    response_format: "mp3",
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(audioPath, bytes);

  return {
    clipId,
    audioPath,
  };
}

export async function readSpeechClip(fileName: string): Promise<Buffer | null> {
  if (!fileName || fileName.includes("..")) {
    return null;
  }
  const target = path.join(AUDIO_DIR, fileName);
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}
