import path from "node:path";
import { promises as fs } from "node:fs";

import { config } from "@/lib/config";
import { runTextModel } from "@/lib/openai/json-response";
import { getRecentRuntimeTranscript } from "@/lib/store/repository";

const PROMPT_FILE_PATH = path.join(process.cwd(), "prompts", "morgan-phase2-invite.md");
const DEFAULT_SYSTEM_PROMPT =
  "You are Morgan in Phase 2: listen continuously and respond only when invited. Use full meeting context, then anchor on the last concrete concept shared. Include: perspective, risk, and practical next step.";
const DEFAULT_USER_TEMPLATE = "Current transcript:\n{{transcript}}\n\nBoard prompt:\n{{question}}";

interface InvitePromptSpec {
  systemPrompt: string;
  userTemplate: string;
}

let cachedPromptSpec: InvitePromptSpec | null = null;

function parsePromptSpec(markdown: string): InvitePromptSpec | null {
  const systemMatch = markdown.match(/##\s*System Prompt\s*([\s\S]*?)##\s*User Prompt Template\s*/i);
  const userMatch = markdown.match(/##\s*User Prompt Template\s*([\s\S]*)$/i);
  const systemPrompt = systemMatch?.[1]?.trim();
  const userTemplate = userMatch?.[1]?.trim();

  if (!systemPrompt || !userTemplate) {
    return null;
  }

  return { systemPrompt, userTemplate };
}

async function getInvitePromptSpec(): Promise<InvitePromptSpec> {
  if (cachedPromptSpec) {
    return cachedPromptSpec;
  }

  try {
    const markdown = await fs.readFile(PROMPT_FILE_PATH, "utf-8");
    const parsed = parsePromptSpec(markdown);
    if (parsed) {
      cachedPromptSpec = parsed;
      return parsed;
    }
  } catch {
    // Fall back to defaults when prompt file is missing or malformed.
  }

  cachedPromptSpec = {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userTemplate: DEFAULT_USER_TEMPLATE,
  };
  return cachedPromptSpec;
}

export async function generateInvitedMorganResponse(sessionId: string, question: string): Promise<string> {
  const transcript = (await getRecentRuntimeTranscript(sessionId, 30))
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");
  const promptSpec = await getInvitePromptSpec();
  const userPrompt = promptSpec.userTemplate
    .replace("{{transcript}}", transcript || "(No transcript available.)")
    .replace("{{question}}", question);

  const fallback =
    "Morgan perspective: Based on the current discussion, I recommend clarifying assumptions, defining ownership, and evaluating second-order risks before committing.";

  return runTextModel(
    {
      model: config.modelMonitor,
      feature: "invite_morgan",
      systemPrompt: promptSpec.systemPrompt,
      userPrompt,
    },
    fallback,
  );
}
