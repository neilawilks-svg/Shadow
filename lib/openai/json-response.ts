import { getOpenAiClient, hasOpenAiKey } from "@/lib/openai/client";
import { estimateCostUsd } from "@/lib/openai/pricing";
import { appendUsageMetric } from "@/lib/store/repository";

interface JsonCallParams {
  model: string;
  feature: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function runJsonModel<T>(params: JsonCallParams, fallback: T): Promise<T> {
  if (!hasOpenAiKey()) {
    return fallback;
  }

  try {
    const client = getOpenAiClient();
    const completion = await client.chat.completions.create({
      model: params.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${params.systemPrompt}\nReturn valid JSON only.`,
        },
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return fallback;
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    await appendUsageMetric({
      feature: params.feature,
      model: params.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(params.model, inputTokens, outputTokens),
    });

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function runTextModel(params: JsonCallParams, fallback: string): Promise<string> {
  if (!hasOpenAiKey()) {
    return fallback;
  }

  try {
    const client = getOpenAiClient();
    const completion = await client.chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      temperature: 0.4,
    });

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    await appendUsageMetric({
      feature: params.feature,
      model: params.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(params.model, inputTokens, outputTokens),
    });

    return completion.choices[0]?.message?.content ?? fallback;
  } catch {
    return fallback;
  }
}
