import { describe, expect, it } from "vitest";

import {
  formatSpeakerTranscriptLine,
  parseShadowTranscriptTurn,
  stripSpeakerPrefix,
} from "@/lib/agents/shadow-transcript-utils";

describe("shadow transcript utils", () => {
  it("prevents duplicate speaker prefixes", () => {
    const line = formatSpeakerTranscriptLine("Anthony Battle", "Anthony Battle: We should lock owners.");
    expect(line).toBe("Anthony Battle: We should lock owners.");
  });

  it("parses transcript turn lines with turn prefixes", () => {
    const parsed = parseShadowTranscriptTurn("[Turn 4] Constantin Beier: We need governance controls.");
    expect(parsed).toEqual({
      speaker: "Constantin Beier",
      text: "We need governance controls.",
    });
  });

  it("parses multiline structured transcript blocks", () => {
    const parsed = parseShadowTranscriptTurn(
      "[Turn 2] Anthony Battle:\nPosition: We need clearer operating thresholds.\nInsight:\n- Drift can break delivery quality.",
    );
    expect(parsed).toEqual({
      speaker: "Anthony Battle",
      text: "Position: We need clearer operating thresholds. Insight: - Drift can break delivery quality.",
    });
  });

  it("strips speaker prefix case-insensitively", () => {
    expect(stripSpeakerPrefix("morgan: Pilot first.", "Morgan")).toBe("Pilot first.");
  });
});
