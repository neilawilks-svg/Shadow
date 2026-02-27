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

  it("strips speaker prefix case-insensitively", () => {
    expect(stripSpeakerPrefix("morgan: Pilot first.", "Morgan")).toBe("Pilot first.");
  });
});
