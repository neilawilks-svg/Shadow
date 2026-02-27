import type { ShadowBoardControls } from "@/types/domain";

export const DEFAULT_REASONING_LEVEL = 6;
export const DEFAULT_MAX_TURNS = 24;
export const DEFAULT_RANDOMNESS = 0.2;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeShadowBoardControls(input: Partial<ShadowBoardControls> | undefined): ShadowBoardControls {
  return {
    reasoningLevel: Math.round(clampNumber(input?.reasoningLevel ?? DEFAULT_REASONING_LEVEL, 1, 10)),
    maxConversationTurns: Math.round(clampNumber(input?.maxConversationTurns ?? DEFAULT_MAX_TURNS, 3, 80)),
    randomness: clampNumber(input?.randomness ?? DEFAULT_RANDOMNESS, 0, 1),
  };
}
