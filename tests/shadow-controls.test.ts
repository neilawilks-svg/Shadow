import { describe, expect, it } from "vitest";

import { normalizeShadowBoardControls } from "@/lib/agents/shadow-controls";

describe("shadow board controls", () => {
  it("uses defaults when missing", () => {
    expect(normalizeShadowBoardControls(undefined)).toEqual({
      reasoningLevel: 6,
      maxConversationTurns: 24,
      randomness: 0.2,
    });
  });

  it("clamps and normalizes out-of-range values", () => {
    expect(
      normalizeShadowBoardControls({
        reasoningLevel: 22,
        maxConversationTurns: 1,
        randomness: -0.8,
      }),
    ).toEqual({
      reasoningLevel: 10,
      maxConversationTurns: 3,
      randomness: 0,
    });
  });

  it("rounds numeric controls for consistency", () => {
    expect(
      normalizeShadowBoardControls({
        reasoningLevel: 5.6,
        maxConversationTurns: 12.2,
        randomness: 0.337,
      }),
    ).toEqual({
      reasoningLevel: 6,
      maxConversationTurns: 12,
      randomness: 0.337,
    });
  });
});
