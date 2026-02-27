import {
  Agent,
  Runner,
  setDefaultOpenAIKey,
  setDefaultOpenAITracingExporter,
  setTracingExportApiKey,
} from "@openai/agents";

import { config } from "@/lib/config";
import { hasOpenAiKey } from "@/lib/openai/client";

let initialized = false;

function ensureAgentsRuntime(): void {
  if (initialized) {
    return;
  }

  if (hasOpenAiKey()) {
    setDefaultOpenAIKey(config.openAiApiKey);
    setTracingExportApiKey(config.openAiApiKey);
    if (config.traceExportEnabled) {
      try {
        setDefaultOpenAITracingExporter();
      } catch {
        // Keep runtime functional even if trace exporter setup fails.
      }
    }
  }

  initialized = true;
}

export function createAgentRunner(params: {
  workflowName: string;
  groupId?: string;
  traceId?: string;
}): Runner {
  ensureAgentsRuntime();
  return new Runner({
    tracingDisabled: !config.traceExportEnabled,
    traceIncludeSensitiveData: false,
    workflowName: params.workflowName,
    groupId: params.groupId,
    traceId: params.traceId,
  });
}

export async function runAgentText(params: {
  model: string;
  workflowName: string;
  groupId?: string;
  traceId?: string;
  instructions: string;
  input: string;
  temperature?: number;
  maxTurns?: number;
}): Promise<string> {
  const agent = new Agent({
    name: params.workflowName,
    instructions: params.instructions,
    model: params.model,
    modelSettings: {
      temperature: params.temperature ?? 0.2,
    },
  });

  const runner = createAgentRunner({
    workflowName: params.workflowName,
    groupId: params.groupId,
    traceId: params.traceId,
  });
  const result = await runner.run(agent, params.input, {
    maxTurns: params.maxTurns ?? 8,
  });

  const output = result.finalOutput;
  return typeof output === "string" ? output : JSON.stringify(output ?? "");
}
