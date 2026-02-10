import { config } from "@/lib/config";
import { runTextModel } from "@/lib/openai/json-response";
import { getRecentRuntimeTranscript } from "@/lib/store/repository";

export async function generateInvitedMorganResponse(sessionId: string, question: string): Promise<string> {
  const transcript = getRecentRuntimeTranscript(sessionId, 30)
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  const fallback =
    "Morgan perspective: Based on the current discussion, I recommend clarifying assumptions, defining ownership, and evaluating second-order risks before committing.";

  return runTextModel(
    {
      model: config.modelMonitor,
      feature: "invite_morgan",
      systemPrompt:
        "You are Morgan, a constructive board contributor. Respond with concise, high-signal guidance. Include: perspective, risk, and practical next step.",
      userPrompt: `Current transcript:\n${transcript}\n\nBoard prompt: ${question}`,
    },
    fallback,
  );
}
