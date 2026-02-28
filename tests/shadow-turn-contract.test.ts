import { describe, expect, it } from "vitest";

import { validateTurn } from "@/lib/agents/shadow-turn-contract";
import type { PersonaProfile } from "@/types/domain";

function makePersona(): PersonaProfile {
  const now = new Date().toISOString();
  return {
    id: "anthony-battle",
    name: "Anthony Battle",
    role: "board_member",
    lens: "Transformation execution",
    values: ["clarity", "outcomes"],
    riskPosture: "balanced",
    decisionStyle: "Direct",
    challengeStyle: "Practical",
    horizon: "medium",
    promptTemplate: "Base",
    fixed: true,
    createdAt: now,
    updatedAt: now,
  };
}

const baseCandidate = {
  position:
    "I think we should frame model accuracy as a business promise tied directly to client outcomes and delivery risk.",
  insights: [
    "A hidden assumption is that lab metrics map to client impact, but commercial variance often appears only after deployment conditions shift.",
    "Without drift thresholds and lineage checks, service teams may unknowingly scale low-quality outputs and erode trust across accounts.",
    "If pricing assumes high automation gains, weak assurance controls can quickly convert margin upside into remediation cost.",
  ],
  advice: [
    "Pilot a model assurance pack over two weeks with explicit KPI thresholds, escalation triggers, and rollback criteria.",
    "Assign a risk owner and delivery owner to codify governance in the statement of work before broad rollout.",
  ],
  questions: [
    "Which client-facing KPI should trigger intervention first when output quality degrades?",
    "Where do current contracts explicitly define accountability for model-assisted recommendations?",
  ],
  interactionModes: ["challenge", "quantify", "operationalise"],
  experienceReference: "I have seen similar delivery drift when controls were not explicit during early scale-up.",
};

describe("shadow turn contract", () => {
  it("accepts valid structured turn", () => {
    const result = validateTurn(baseCandidate, {
      persona: makePersona(),
      agenda: "Define AI-enabled service assurance for Slalom UK & Ireland",
      topic: "model accuracy and accountability",
      transcript: [],
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects invalid section counts and word range", () => {
    const result = validateTurn(
      {
        ...baseCandidate,
        position: "Too short",
        insights: ["Only one insight"],
        advice: [],
        questions: [],
      },
      {
        persona: makePersona(),
        agenda: "Define AI-enabled service assurance for Slalom UK & Ireland",
        topic: "model accuracy and accountability",
        transcript: [],
      },
    );
    expect(result.valid).toBe(false);
    expect(result.violations.join(" ")).toContain("Insights must contain 2 to 5 bullets");
    expect(result.violations.join(" ")).toContain("Advice must contain 1 to 3 bullets");
    expect(result.violations.join(" ")).toContain("Questions must contain 1 to 2 bullets");
  });

  it("rejects weak interaction and decision language", () => {
    const result = validateTurn(
      {
        ...baseCandidate,
        interactionModes: ["build"],
        advice: ["We decide to approve this now across all clients with immediate effect."],
      },
      {
        persona: makePersona(),
        agenda: "Define AI-enabled service assurance for Slalom UK & Ireland",
        topic: "model accuracy and accountability",
        transcript: [],
      },
    );
    expect(result.valid).toBe(false);
    expect(result.violations.join(" ")).toContain("At least two interaction modes are required");
    expect(result.violations.join(" ")).toContain("Decision language is not allowed");
  });

  it("rejects biography-heavy patterns", () => {
    const result = validateTurn(
      {
        ...baseCandidate,
        experienceReference:
          "He is known for his career and served as former CTO, with broad experience at many firms and long title history.",
      },
      {
        persona: makePersona(),
        agenda: "Define AI-enabled service assurance for Slalom UK & Ireland",
        topic: "model accuracy and accountability",
        transcript: [],
      },
    );
    expect(result.valid).toBe(false);
    expect(result.violations.join(" ")).toContain("biography-heavy");
  });
});
