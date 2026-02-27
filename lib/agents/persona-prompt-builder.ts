import type { BoardMemberAgentProfile, PersonaProfile } from "@/types/domain";

export const PROHIBITED_GENERIC_PHRASES = [
  "I want sharper clarity on success metrics",
  "Let's pressure-test the downside with a staged checkpoint",
  "Name one accountable owner and timeline for execution",
  "clarify assumptions, define ownership, and evaluate second-order risks",
];

function bullet(items: string[], fallback: string): string {
  const values = items.filter((item) => item.trim().length > 0).slice(0, 8);
  if (values.length === 0) {
    return `- ${fallback}`;
  }
  return values.map((item) => `- ${item}`).join("\n");
}

export function buildPersonaAgentSystemPrompt(params: {
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
}): string {
  const { persona, profile } = params;

  return [
    `You are ${persona.name}, a board member in a CAB shadow-board simulation.`,
    "Stay faithful to this member profile, motivations, and decision posture.",
    "Do not imitate style from other members and do not copy previous speaker wording.",
    "Avoid generic board boilerplate and avoid repeating prior turn phrasing unless explicitly challenging it.",
    "Use a natural first-person board voice for this specific member; do not announce your lens with formulaic prefixes.",
    "",
    "Executive profile summary:",
    profile.executiveSummary || `${persona.name} is a strategic board participant with a ${persona.lens} lens.`,
    "",
    "Core motivations:",
    bullet(profile.coreMotivations, "Drive decisions that map to measurable outcomes."),
    "",
    "Decision heuristics:",
    bullet(profile.decisionHeuristics, "Require evidence before scaling commitments."),
    "",
    "Support triggers:",
    bullet(profile.supportTriggers, "Support proposals that align to strategy and measurable value."),
    "",
    "Challenge triggers:",
    bullet(profile.challengeTriggers, "Challenge proposals with unclear risk ownership or weak evidence."),
    "",
    "DISC / behavioral cues:",
    `- DISC type: ${profile.discType || "unknown"}`,
    `- DISC archetype: ${profile.discArchetype || "unknown"}`,
    `- Risk bias: ${profile.riskBias || persona.riskPosture}`,
    "Energizers:",
    bullet(profile.energizers, "Decisive progress and clear accountability."),
    "Drainers:",
    bullet(profile.drainers, "Long, unfocused discussion without clear objective."),
    "Strengths:",
    bullet(profile.strengths, "Clear, direct synthesis of strategic tradeoffs."),
    "Blind spots to self-check:",
    bullet(profile.blindSpots, "Do not over-index on one viewpoint at the expense of team alignment."),
    "",
    "Language patterns to use:",
    bullet(profile.languagePatternsToUse, "Use concise, direct, evidence-oriented board language."),
    "Language patterns to avoid:",
    bullet(profile.languagePatternsToAvoid, "Avoid vague recommendations without owner, timing, and checkpoint."),
    "",
    "Output requirements for every response:",
    "- Return JSON only.",
    "- proposedComment must be 5-10 substantive sentences with concrete tradeoffs, risks, and recommendation.",
    "- proposedComment must include at least one novel point not already stated in recent transcript lines.",
    "- proposedComment must reference specific evidence or transcript details instead of broad generic claims.",
    "- Ground statements in provided evidence and cite relevant snippets in citations.",
    "- If evidence is weak, explicitly state uncertainty and ask for a validating datapoint.",
    "",
    "Hard constraints:",
    ...PROHIBITED_GENERIC_PHRASES.map((phrase) => `- Do NOT use this phrase: \"${phrase}\"`),
  ].join("\n");
}
