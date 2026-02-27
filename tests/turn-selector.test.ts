import { describe, expect, it } from "vitest";

import { selectNextSpeakerBid } from "@/lib/agents/turn-selector";
import type { BoardTurnBid } from "@/types/domain";

function bid(personaId: string, urgency: number, shouldSpeak = true): BoardTurnBid {
  return {
    personaId,
    urgency_1_to_10: urgency,
    shouldSpeak,
    proposedComment: `${personaId} comment`,
    reason: `${personaId} reason`,
    confidence: 0.7,
    citations: [],
  };
}

describe("turn selector", () => {
  it("uses deterministic tie-break order", () => {
    const selected = selectNextSpeakerBid(
      [bid("charlie", 8), bid("alpha", 8), bid("bravo", 8)],
      {
        turnIndex: 20,
        lastSpokenAt: new Map([
          ["alpha", 19],
          ["bravo", 12],
          ["charlie", 12],
        ]),
        turnCounts: new Map([
          ["alpha", 1],
          ["bravo", 4],
          ["charlie", 4],
        ]),
      },
    );

    expect(selected?.personaId).toBe("bravo");
  });

  it("falls back to full bid pool when nobody marked shouldSpeak", () => {
    const selected = selectNextSpeakerBid(
      [bid("alpha", 4, false), bid("bravo", 7, false)],
      {
        turnIndex: 4,
        lastSpokenAt: new Map(),
        turnCounts: new Map(),
      },
    );

    expect(selected?.personaId).toBe("bravo");
  });

  it("applies soft fairness boost for idle and underrepresented speakers", () => {
    const selected = selectNextSpeakerBid(
      [bid("alpha", 7), bid("bravo", 7), bid("charlie", 7)],
      {
        turnIndex: 14,
        lastSpokenAt: new Map([
          ["alpha", 13],
          ["bravo", 8],
          ["charlie", 6],
        ]),
        turnCounts: new Map([
          ["alpha", 1],
          ["bravo", 6],
          ["charlie", 5],
        ]),
      },
    );

    expect(selected?.personaId).toBe("charlie");
  });
});
