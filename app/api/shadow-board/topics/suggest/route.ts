import { z } from "zod";

import { config } from "@/lib/config";
import { jsonError, jsonOk } from "@/lib/http";
import { runJsonModel } from "@/lib/openai/json-response";

const schema = z.object({
  agenda: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("Invalid agenda payload.", 400, parsed.error.flatten());
  }

  const fallbackTopics = parsed.data.agenda
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  const result = await runJsonModel<{ topics?: string[] }>(
    {
      model: config.modelShadowBoard,
      feature: "shadow_board_topics",
      systemPrompt:
        "Extract concise board-discussion topics from the agenda. Return JSON only. Keep each topic under 8 words.",
      userPrompt: `Agenda:\n${parsed.data.agenda}\n\nReturn: {"topics":["..."]}`,
      temperature: 0.2,
    },
    { topics: fallbackTopics },
  );

  const topics = (result.topics ?? [])
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 10);

  return jsonOk({ topics: topics.length > 0 ? topics : fallbackTopics });
}
