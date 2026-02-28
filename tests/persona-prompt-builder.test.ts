import { describe, expect, it } from "vitest";

import { buildPersonaAgentSystemPrompt } from "@/lib/agents/persona-prompt-builder";
import type { BoardMemberAgentProfile, PersonaProfile } from "@/types/domain";

function makePersona(id: string, name: string): PersonaProfile {
  const now = new Date().toISOString();
  return {
    id,
    name,
    role: "board_member",
    lens: "Risk and growth alignment",
    values: ["clarity", "evidence"],
    riskPosture: "balanced",
    decisionStyle: "Analytical",
    challengeStyle: "Direct",
    horizon: "long",
    promptTemplate: "Base prompt",
    fixed: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProfile(personaId: string, name: string, motivation: string): BoardMemberAgentProfile {
  return {
    personaId,
    name,
    executiveSummary: `${name} focuses on measurable strategic outcomes.`,
    coreMotivations: [motivation],
    decisionHeuristics: ["Require evidence before scale."],
    supportTriggers: ["Supports evidence-backed pilots."],
    challengeTriggers: ["Challenges weak ownership and risk controls."],
    riskBias: "balanced",
    discType: "D",
    discArchetype: "Captain",
    energizers: ["Producing results"],
    drainers: ["Unfocused tangents"],
    strengths: ["Direct synthesis"],
    blindSpots: ["May move too quickly"],
    languagePatternsToUse: ["What evidence supports this?"],
    languagePatternsToAvoid: ["Avoid generic phrasing."],
    sourceDocIds: ["doc-1"],
    sourcePaths: ["/tmp/doc-1.md"],
    generatedAt: "2026-02-19T00:00:00Z",
  };
}

describe("persona prompt builder", () => {
  it("includes member-specific motivation and DISC fields", () => {
    const persona = makePersona("anthony-battle", "Anthony Battle");
    const profile = makeProfile(persona.id, persona.name, "Speed to value with clear accountability.");

    const prompt = buildPersonaAgentSystemPrompt({ persona, profile });

    expect(prompt).toContain("Speed to value with clear accountability");
    expect(prompt).toContain("DISC type: D");
    expect(prompt).toContain("DISC archetype: Captain");
    expect(prompt).toContain("Do not imitate style from other members");
    expect(prompt).toContain("advisory board simulation for Slalom UK & Ireland");
    expect(prompt).toContain("position (1 sentence), insights (2-5 bullets), advice (1-3 bullets), questions (1-2 bullets)");
    expect(prompt).toContain("interactionModes");
    expect(prompt).toContain("Do not include long lists of employers");
  });

  it("produces different prompts for different board members", () => {
    const anthonyPrompt = buildPersonaAgentSystemPrompt({
      persona: makePersona("anthony-battle", "Anthony Battle"),
      profile: makeProfile("anthony-battle", "Anthony Battle", "Move quickly toward measurable outcomes."),
    });

    const constantinPrompt = buildPersonaAgentSystemPrompt({
      persona: makePersona("constantin-beier", "Constantin Beier"),
      profile: makeProfile("constantin-beier", "Constantin Beier", "Strengthen governance and control thresholds."),
    });

    expect(anthonyPrompt).not.toEqual(constantinPrompt);
    expect(anthonyPrompt).toContain("Move quickly toward measurable outcomes");
    expect(constantinPrompt).toContain("Strengthen governance and control thresholds");
  });
});
