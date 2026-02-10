import OpenAI from "openai";

import { config } from "@/lib/config";

let singleton: OpenAI | null = null;

export function hasOpenAiKey(): boolean {
  return Boolean(config.openAiApiKey && config.openAiApiKey.trim().length > 0);
}

export function getOpenAiClient(): OpenAI {
  if (!hasOpenAiKey()) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!singleton) {
    singleton = new OpenAI({ apiKey: config.openAiApiKey });
  }

  return singleton;
}
