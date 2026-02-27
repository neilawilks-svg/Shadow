import { runAgentText } from "@/lib/agents/runtime";
import { hasOpenAiKey } from "@/lib/openai/client";
import { parseJsonFromText } from "@/lib/openai/json-parse";
import { estimateCostUsd } from "@/lib/openai/pricing";
import { appendUsageMetric } from "@/lib/store/repository";

interface JsonCallParams {
  model: string;
  feature: string;
  systemPrompt: string;
  userPrompt: string;
  workflowName?: string;
  groupId?: string;
  traceId?: string;
  temperature?: number;
  maxTurns?: number;
}

export async function runJsonModel<T>(params: JsonCallParams, fallback: T): Promise<T> {
  if (!hasOpenAiKey()) {
    return fallback;
  }

  try {
    const raw = await runAgentText({
      model: params.model,
      workflowName: params.workflowName ?? params.feature,
      groupId: params.groupId ?? params.feature,
      traceId: params.traceId,
      instructions: `${params.systemPrompt}\nReturn valid JSON only.`,
      input: params.userPrompt,
      temperature: params.temperature ?? 0.2,
      maxTurns: params.maxTurns ?? 6,
    });
    if (!raw) {
      return fallback;
    }

    const inputTokens = Math.ceil(params.userPrompt.length / 4);
    const outputTokens = Math.ceil(raw.length / 4);

    await appendUsageMetric({
      feature: params.feature,
      model: params.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(params.model, inputTokens, outputTokens),
    });

    const parsed = parseJsonFromText<T>(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function runTextModel(params: JsonCallParams, fallback: string): Promise<string> {
  if (!hasOpenAiKey()) {
    return fallback;
  }

  try {
    const text = await runAgentText({
      model: params.model,
      workflowName: params.workflowName ?? params.feature,
      groupId: params.groupId ?? params.feature,
      traceId: params.traceId,
      instructions: params.systemPrompt,
      input: params.userPrompt,
      temperature: params.temperature ?? 0.4,
      maxTurns: params.maxTurns ?? 6,
    });
    const inputTokens = Math.ceil(params.userPrompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);

    await appendUsageMetric({
      feature: params.feature,
      model: params.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(params.model, inputTokens, outputTokens),
    });

    return text || fallback;
  } catch {
    return fallback;
  }
}
