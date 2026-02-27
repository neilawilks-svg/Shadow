import { describe, expect, it } from "vitest";

import { buildPersonaNeutralPlaceholders } from "@/lib/agents/shadow-ui-placeholders";

describe("shadow UI placeholders", () => {
  it("does not use removed static fallback phrase", () => {
    const placeholders = buildPersonaNeutralPlaceholders({
      persona: {
        id: "constantin-beier",
        name: "Constantin Beier",
        lens: "Risk-aware operations and governance",
        paceIncentive: "deliberate",
      },
      existingComment: "",
      thinkingSteps: ["Anchor the decision in evidence and controls."],
    });

    expect(placeholders.length).toBeGreaterThanOrEqual(3);
    expect(placeholders.join(" ")).not.toContain("I want sharper clarity on success metrics");
    expect(placeholders[0]).toContain("Constantin Beier");
  });
});
