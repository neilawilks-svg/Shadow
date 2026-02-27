import { Agent } from "@openai/agents";

import { config } from "@/lib/config";
import { buildPersonaAgentSystemPrompt } from "@/lib/agents/persona-prompt-builder";
import type { BoardMemberAgentProfile, PersonaProfile } from "@/types/domain";

interface AgentRegistryEntry {
  key: string;
  prompt: string;
  model: string;
  createdAt: string;
  agent: Agent;
}

declare global {
  var __shadowMemberAgentRegistry: Map<string, AgentRegistryEntry> | undefined;
}

const registry = globalThis.__shadowMemberAgentRegistry ?? new Map<string, AgentRegistryEntry>();
globalThis.__shadowMemberAgentRegistry = registry;

function buildRegistryKey(shadowSessionId: string, personaId: string): string {
  return `${shadowSessionId}:${personaId}`;
}

export function getOrCreateShadowMemberAgent(params: {
  shadowSessionId: string;
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
}): Agent {
  const key = buildRegistryKey(params.shadowSessionId, params.persona.id);
  const prompt = buildPersonaAgentSystemPrompt({
    persona: params.persona,
    profile: params.profile,
  });

  const existing = registry.get(key);
  if (existing && existing.prompt === prompt && existing.model === config.modelShadowBoard) {
    return existing.agent;
  }

  const agent = new Agent({
    name: `shadow-member-${params.persona.id}`,
    model: config.modelShadowBoard,
    instructions: prompt,
    modelSettings: {
      temperature: 0.45,
    },
  });

  registry.set(key, {
    key,
    prompt,
    model: config.modelShadowBoard,
    createdAt: new Date().toISOString(),
    agent,
  });

  return agent;
}

export function clearShadowMemberAgents(shadowSessionId?: string): void {
  if (!shadowSessionId) {
    registry.clear();
    return;
  }

  const prefix = `${shadowSessionId}:`;
  for (const key of registry.keys()) {
    if (key.startsWith(prefix)) {
      registry.delete(key);
    }
  }
}
