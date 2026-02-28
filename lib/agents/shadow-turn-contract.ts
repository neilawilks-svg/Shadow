import type { BoardMemberAgentProfile, PersonaProfile } from "@/types/domain";

export type InteractionMode =
  | "build"
  | "challenge"
  | "bridge"
  | "quantify"
  | "operationalise"
  | "scenario";

export interface StructuredTurnCandidate {
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
  interactionModes: string[];
  experienceReference?: string;
  reason?: string;
  confidence?: number;
  citations?: string[];
}

export interface TurnValidationContext {
  persona: PersonaProfile;
  agenda: string;
  topic: string;
  transcript: string[];
}

export interface TurnValidationResult {
  valid: boolean;
  violations: string[];
  normalized: {
    position: string;
    insights: string[];
    advice: string[];
    questions: string[];
    interactionModes: InteractionMode[];
    experienceReference?: string;
  };
}

const ALLOWED_INTERACTION_MODES: InteractionMode[] = [
  "build",
  "challenge",
  "bridge",
  "quantify",
  "operationalise",
  "scenario",
];

const DECISION_LANGUAGE_PATTERNS = [
  /\bwe\s+decide\b/i,
  /\bboard\s+approves\b/i,
  /\bapproved\b/i,
  /\bfinal decision\b/i,
  /\bmust be approved\b/i,
];

const BIOGRAPHY_PATTERNS = [
  /\bserved as\b/i,
  /\bformer (ceo|cfo|cto|coo|partner|director)\b/i,
  /\bcareer\b/i,
  /\bworked at\b/i,
  /\bexperience at\b/i,
  /\bknown for\b/i,
];

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toSentence(value: string): string {
  const cleaned = normalizeLine(value);
  if (!cleaned) {
    return "";
  }
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function toAllowedModes(values: string[]): InteractionMode[] {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is InteractionMode => ALLOWED_INTERACTION_MODES.includes(value as InteractionMode));

  return Array.from(new Set(normalized));
}

function coversAgenda(candidateText: string, agenda: string, topic: string): boolean {
  const candidate = candidateText.toLowerCase();
  const sourceTokens = `${agenda} ${topic}`
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g);
  if (!sourceTokens || sourceTokens.length === 0) {
    return true;
  }
  const unique = Array.from(new Set(sourceTokens)).slice(0, 16);
  const hits = unique.filter((token) => candidate.includes(token)).length;
  return hits >= Math.max(2, Math.floor(unique.length * 0.2));
}

function isBioHeavy(text: string): boolean {
  const lowered = text.toLowerCase();
  let hits = 0;
  for (const pattern of BIOGRAPHY_PATTERNS) {
    if (pattern.test(lowered)) {
      hits += 1;
    }
  }
  return hits >= 2;
}

export function formatStructuredTurn(params: {
  personaName: string;
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
}): string {
  return [
    `${params.personaName}:`,
    `Position: ${normalizeLine(params.position)}`,
    "Insight:",
    ...params.insights.map((item) => `- ${normalizeLine(item)}`),
    "Advice:",
    ...params.advice.map((item) => `- ${normalizeLine(item)}`),
    "Question:",
    ...params.questions.map((item) => `- ${normalizeLine(item)}`),
  ].join("\n");
}

export function validateTurn(
  candidate: StructuredTurnCandidate,
  context: TurnValidationContext,
): TurnValidationResult {
  const position = normalizeLine(candidate.position ?? "");
  const insights = (candidate.insights ?? []).map(normalizeLine).filter(Boolean);
  const advice = (candidate.advice ?? []).map(normalizeLine).filter(Boolean);
  const questions = (candidate.questions ?? []).map(normalizeLine).filter(Boolean);
  const interactionModes = toAllowedModes(candidate.interactionModes ?? []);
  const experienceReference = normalizeLine(candidate.experienceReference ?? "");

  const violations: string[] = [];
  const positionSentences = splitSentences(position);
  if (positionSentences.length !== 1) {
    violations.push("Position must be exactly one sentence.");
  }
  if (insights.length < 2 || insights.length > 5) {
    violations.push("Insights must contain 2 to 5 bullets.");
  }
  if (advice.length < 1 || advice.length > 3) {
    violations.push("Advice must contain 1 to 3 bullets.");
  }
  if (questions.length < 1 || questions.length > 2) {
    violations.push("Questions must contain 1 to 2 bullets.");
  }
  if (interactionModes.length < 2) {
    violations.push("At least two interaction modes are required.");
  }
  if (experienceReference && splitSentences(experienceReference).length > 1) {
    violations.push("Experience reference must be at most one sentence.");
  }

  const combined = [position, ...insights, ...advice, ...questions, experienceReference].filter(Boolean).join(" ");
  const wordCount = countWords(combined);
  if (wordCount < 90 || wordCount > 170) {
    violations.push("Turn word count must be between 90 and 170 words.");
  }

  for (const pattern of DECISION_LANGUAGE_PATTERNS) {
    if (pattern.test(combined)) {
      violations.push("Decision language is not allowed for advisory turns.");
      break;
    }
  }

  if (isBioHeavy(combined)) {
    violations.push("Turn is too biography-heavy.");
  }

  if (!coversAgenda(combined, context.agenda, context.topic)) {
    violations.push("Turn is insufficiently anchored to agenda/topic.");
  }

  return {
    valid: violations.length === 0,
    violations,
    normalized: {
      position,
      insights,
      advice,
      questions,
      interactionModes,
      experienceReference: experienceReference || undefined,
    },
  };
}

export function buildDeterministicStructuredFallback(params: {
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  agenda: string;
  turnIndex?: number;
  variant?: number;
  reason: string;
}): StructuredTurnCandidate {
  const agendaAnchor = params.agenda.slice(0, 180);
  const seed = `${params.persona.id}:${params.turnIndex ?? 0}:${params.variant ?? 0}:${params.topic}`;
  const seedValue = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const pick = (items: string[], fallback: string, offset = 0): string => {
    const normalized = items.map((item) => normalizeLine(item)).filter(Boolean);
    if (normalized.length === 0) {
      return fallback;
    }
    return normalized[(seedValue + offset) % normalized.length] ?? fallback;
  };

  const lens = params.persona.lens.toLowerCase();
  const decisionHeuristic = pick(
    params.profile.decisionHeuristics,
    `Prioritize an evidence-backed operating model for ${params.topic} with explicit thresholds before scaling.`,
    1,
  );
  const supportTrigger = pick(
    params.profile.supportTriggers,
    "Back initiatives that tie measurable client value to clear delivery accountability.",
    2,
  );
  const challengeTrigger = pick(
    params.profile.challengeTriggers,
    "Challenge plans that under-specify risk ownership, escalation paths, or monitoring controls.",
    3,
  );
  const strength = pick(
    params.profile.strengths,
    "Translate strategic intent into practical operating changes with measurable outcomes.",
    4,
  );
  const blindSpot = pick(
    params.profile.blindSpots,
    "Ensure speed does not overtake governance discipline in client-facing delivery.",
    5,
  );
  const languageCue = pick(
    params.profile.languagePatternsToUse,
    "Use concise, evidence-led board language tied to trade-offs and delivery implications.",
    6,
  );

  const riskLine =
    params.persona.riskPosture === "risk_averse"
      ? "risk containment and assurance discipline"
      : params.persona.riskPosture === "risk_tolerant"
        ? "calibrated experimentation with explicit downside boundaries"
        : "balanced delivery velocity and governance control";

  const position = toSentence(
    `${params.persona.name} views ${params.topic} through a ${lens} perspective and recommends a ${riskLine} approach for Slalom UK & Ireland`,
  );

  const insights = [
    toSentence(
      `Key assumption to pressure-test: ${decisionHeuristic.toLowerCase().replace(/^[a-z]/, (char) => char)}`,
    ),
    toSentence(
      `Second-order implication from this lens: ${challengeTrigger.toLowerCase().replace(/^[a-z]/, (char) => char)}`,
    ),
    toSentence(
      `Execution differentiator for this member: ${strength.toLowerCase().replace(/^[a-z]/, (char) => char)}`,
    ),
  ];

  const advice = [
    toSentence(`In the next 2-4 weeks, run a focused pilot where success criteria directly reflect ${supportTrigger.toLowerCase()}`),
    toSentence(`Create a delivery checkpoint that explicitly addresses this blind spot: ${blindSpot.toLowerCase()}`),
    toSentence(`Keep the recommendation language concrete: ${languageCue.toLowerCase()}`),
  ];

  const questions = [
    "Which single KPI would prove this topic is creating differentiated value rather than faster commodity output?",
    "Where is the named owner for risk monitoring, and what escalation threshold triggers intervention?",
  ];

  return {
    position,
    insights,
    advice,
    questions,
    interactionModes: ["quantify", "operationalise", "challenge"],
    experienceReference: `${params.persona.name} is using an execution-focused lens tied to this agenda context: ${agendaAnchor}.`,
    reason: params.reason,
    confidence: 0.55,
    citations: [],
  };
}
