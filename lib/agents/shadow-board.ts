import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import { ensureLocalRagMcpConnected } from "@/lib/agents/mcp-rag";
import { getOrCreateShadowMemberAgent } from "@/lib/agents/member-agent-registry";
import { PROHIBITED_GENERIC_PHRASES } from "@/lib/agents/persona-prompt-builder";
import { clampNumber, normalizeShadowBoardControls } from "@/lib/agents/shadow-controls";
import {
  buildDeterministicStructuredFallback,
  formatStructuredTurn,
  type InteractionMode,
  type StructuredTurnCandidate,
  validateTurn,
} from "@/lib/agents/shadow-turn-contract";
import { selectNextSpeakerBid } from "@/lib/agents/turn-selector";
import { createAgentRunner } from "@/lib/agents/runtime";
import { config } from "@/lib/config";
import { publishShadowBoardEvent } from "@/lib/events/shadow-board-event-bus";
import { parseJsonFromText } from "@/lib/openai/json-parse";
import { runJsonModel } from "@/lib/openai/json-response";
import { hasOpenAiKey } from "@/lib/openai/client";
import {
  createShadowBoardRun,
  getBoardMemberProfilePack,
  getDocumentById,
  getPersonas,
  isBoardMemberProfilePackStale,
  updateShadowBoardRun,
} from "@/lib/store/repository";
import type {
  AgendaItem,
  BoardMemberAgentProfile,
  BoardTurnBid,
  PersonaDebateOutput,
  PersonaProfile,
  ShadowBoardRecommendation,
  ShadowBoardRun,
  ShadowBoardRunEvent,
  ShadowBoardTurnMeta,
} from "@/types/domain";

const execFileAsync = promisify(execFile);

interface RunInput {
  agenda: string;
  topics: string[];
  agendaItems?: AgendaItem[];
  personaIds: string[];
  meetingId?: string;
  shadowSessionId?: string;
  documentIds?: string[];
  reasoningLevel?: number;
  maxConversationTurns?: number;
  randomness?: number;
  meetingArtifacts?: string[];
  outputFormat?: "markdown" | "plain_text";
  targetWordCount?: number;
  transcriptSeed?: string[];
}

interface PlannedAgendaItem extends AgendaItem {
  plannedTurns: number;
}

interface PersonaTurn {
  personaId: string;
  personaName: string;
  comment: string;
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
  interactionModes: InteractionMode[];
  thinkingStep: string;
  risk: string;
  recommendation: string;
  challengeQuestion: string;
  confidence: number;
  round: number;
}

interface ConsensusSynthesis {
  consensusSummary?: string;
  dissentSummary?: string;
  recommendations?: Array<{
    theme?: string;
    recommendation?: string;
    rationale?: string;
    risks?: string[];
    counterpoints?: string[];
    confidence?: number;
  }>;
}

interface MemberResponse {
  comment: string;
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
  interactionModes: InteractionMode[];
  experienceReference?: string;
  reason: string;
  confidence: number;
  citations: string[];
  repetitionWarning?: string;
}

const MAX_TRANSCRIPT_LINES = 220;
const MIN_SPEAKING_QUORUM = 3;
const DEFAULT_SHADOW_SESSION_ID = "shadow-session-default";

function normalizeShadowSessionId(input: string | undefined, runId: string): string {
  const candidate = (input ?? "").trim();
  if (!candidate) {
    return `${DEFAULT_SHADOW_SESSION_ID}-${runId}`;
  }
  return candidate.slice(0, 120);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function mapProfilesByPersonaId(profiles: BoardMemberAgentProfile[]): Map<string, BoardMemberAgentProfile> {
  return new Map(profiles.map((profile) => [profile.personaId, profile]));
}

function normalizeStringArray(input: unknown, maxItems: number): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const set = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") {
      continue;
    }
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      continue;
    }
    set.add(cleaned);
    if (set.size >= maxItems) {
      break;
    }
  }

  return [...set];
}

function toSentence(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  if (/[.!?]$/.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}.`;
}

function countWords(input: string): number {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(input: string, maxWords: number): string {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return input.trim();
  }
  return `${words.slice(0, maxWords).join(" ").replace(/[,\s;:.-]*$/, "")}.`;
}

function normalizeStructuredTurnWordRange(params: {
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
  experienceReference?: string;
  agenda: string;
  topic: string;
}): {
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
  experienceReference?: string;
} {
  const position = toSentence(params.position);
  const insights = [...params.insights];
  const advice = [...params.advice];
  const questions = [...params.questions];
  let experienceReference = params.experienceReference ? toSentence(params.experienceReference) : undefined;

  const totalWords = () =>
    countWords([position, ...insights, ...advice, ...questions, experienceReference ?? ""].join(" "));

  const expansion = `This directly affects ${params.topic} execution quality, risk transparency, and client trust for Slalom UK & Ireland.`;

  let i = 0;
  while (totalWords() < 90 && i < 20) {
    if (insights.length > 0) {
      const idx = i % insights.length;
      insights[idx] = `${insights[idx]} ${expansion}`.replace(/\s+/g, " ").trim();
    } else if (advice.length > 0) {
      const idx = i % advice.length;
      advice[idx] = `${advice[idx]} ${expansion}`.replace(/\s+/g, " ").trim();
    } else if (questions.length > 0) {
      const idx = i % questions.length;
      questions[idx] = `${questions[idx]} ${expansion}`.replace(/\s+/g, " ").trim();
    } else {
      experienceReference = `${params.agenda.slice(0, 140)}.`.replace(/\s+/g, " ").trim();
    }
    i += 1;
  }

  let guard = 0;
  while (totalWords() > 170 && guard < 40) {
    const candidates = [
      ...insights.map((value, idx) => ({ group: "insights" as const, idx, words: countWords(value), value })),
      ...advice.map((value, idx) => ({ group: "advice" as const, idx, words: countWords(value), value })),
      ...questions.map((value, idx) => ({ group: "questions" as const, idx, words: countWords(value), value })),
    ].sort((a, b) => b.words - a.words);

    const current = candidates[0];
    if (!current || current.words <= 8) {
      if (experienceReference) {
        experienceReference = undefined;
      } else {
        break;
      }
    } else {
      const excess = totalWords() - 170;
      const target = Math.max(8, current.words - excess);
      const trimmed = trimToWordLimit(current.value, target);
      if (current.group === "insights") {
        insights[current.idx] = trimmed;
      } else if (current.group === "advice") {
        advice[current.idx] = trimmed;
      } else {
        questions[current.idx] = trimmed;
      }
    }
    guard += 1;
  }

  return {
    position,
    insights,
    advice,
    questions,
    experienceReference,
  };
}

function firstSentence(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  const sentence = cleaned.match(/[^.!?]+[.!?]?/)?.[0] ?? cleaned;
  return toSentence(sentence);
}

function stripSpeakerPrefix(comment: string, personaName: string): string {
  const escapedName = personaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedName}:\\s*`, "i");
  return comment.replace(pattern, "").trim();
}

export function normalizeAgendaItems(input: {
  agenda: string;
  topics: string[];
  agendaItems?: AgendaItem[];
}): PlannedAgendaItem[] {
  if (Array.isArray(input.agendaItems) && input.agendaItems.length > 0) {
    return input.agendaItems.map((item, index) => ({
      id: item.id?.trim() || `agenda-item-${index + 1}`,
      title: item.title.trim(),
      timePercent: Math.max(1, Math.min(100, Math.round(item.timePercent))),
      desiredOutput: item.desiredOutput?.trim() ?? "",
      questions: normalizeStringArray(item.questions, 10),
      plannedTurns: Math.max(0, item.plannedTurns ?? 0),
    }));
  }

  const fallbackTitle = input.topics[0] ?? input.agenda;
  return [
    {
      id: "agenda-item-1",
      title: fallbackTitle || "Agenda item",
      timePercent: 100,
      desiredOutput: input.agenda,
      questions: normalizeStringArray(input.topics.slice(1), 10),
      plannedTurns: 0,
    },
  ];
}

export function allocateTurnsForAgendaItems(
  maxConversationTurns: number,
  agendaItems: PlannedAgendaItem[],
): PlannedAgendaItem[] {
  if (agendaItems.length === 0 || maxConversationTurns <= 0) {
    return [];
  }

  const totalPercent = agendaItems.reduce((sum, item) => sum + item.timePercent, 0) || 1;
  const quotas = agendaItems.map((item) => (item.timePercent / totalPercent) * maxConversationTurns);
  const floorTurns = quotas.map((quota) => Math.floor(quota));
  const remainders = quotas.map((quota, index) => ({ index, remainder: quota - floorTurns[index]! }));

  let allocated = floorTurns.reduce((sum, turns) => sum + turns, 0);
  const plannedTurns = [...floorTurns];

  remainders.sort((a, b) => b.remainder - a.remainder);
  let remainderIndex = 0;
  while (allocated < maxConversationTurns) {
    const target = remainders[remainderIndex % remainders.length]?.index ?? 0;
    plannedTurns[target] = (plannedTurns[target] ?? 0) + 1;
    allocated += 1;
    remainderIndex += 1;
  }

  if (maxConversationTurns >= agendaItems.length) {
    const needsTurns = plannedTurns
      .map((turns, index) => ({ turns, index }))
      .filter((item) => item.turns === 0);
    const donors = () =>
      plannedTurns
        .map((turns, index) => ({ turns, index }))
        .filter((item) => item.turns > 1)
        .sort((a, b) => b.turns - a.turns);

    for (const needy of needsTurns) {
      const donor = donors()[0];
      if (!donor) {
        break;
      }
      plannedTurns[donor.index] = donor.turns - 1;
      plannedTurns[needy.index] = 1;
    }
  }

  return agendaItems.map((item, index) => ({
    ...item,
    plannedTurns: plannedTurns[index] ?? 0,
  }));
}

export function buildAgendaTurnSchedule(agendaItems: PlannedAgendaItem[], maxConversationTurns: number): PlannedAgendaItem[] {
  const schedule: PlannedAgendaItem[] = [];
  for (const item of agendaItems) {
    for (let i = 0; i < item.plannedTurns; i += 1) {
      schedule.push(item);
    }
  }
  if (schedule.length === 0 && agendaItems[0]) {
    schedule.push(agendaItems[0]);
  }
  while (schedule.length < maxConversationTurns && agendaItems.length > 0) {
    schedule.push(agendaItems[schedule.length % agendaItems.length]!);
  }
  return schedule.slice(0, maxConversationTurns);
}

function buildAgendaItemPromptContext(item: PlannedAgendaItem): string {
  return [
    `Current agenda item: ${item.title} (${item.timePercent}% planned, ${item.plannedTurns} planned turns)`,
    `Desired output: ${item.desiredOutput || "No specific desired output provided."}`,
    "Questions to answer:",
    ...(item.questions.length > 0 ? item.questions.map((question) => `- ${question}`) : ["- none specified"]),
  ].join("\n");
}

function shouldApplyAiDepthGuidance(agenda: string, topics: string[]): boolean {
  const text = `${agenda}\n${topics.join("\n")}`.toLowerCase();
  return [
    "ai",
    "model",
    "accuracy",
    "accountability",
    "assurance",
    "liability",
    "go-to-market",
    "pricing",
  ].some((token) => text.includes(token));
}

function buildAiDepthGuidance(agenda: string, topics: string[]): string {
  if (!shouldApplyAiDepthGuidance(agenda, topics)) {
    return "";
  }
  return [
    "Agenda depth guidance for AI/accountability discussions:",
    "- Distinguish business KPI accuracy from model metric accuracy thresholds.",
    "- Address data quality, lineage, drift monitoring, and intervention triggers.",
    "- Specify human-in-the-loop review and escalation paths.",
    "- Cover liability and client contract implications.",
    "- Clarify packaging/pricing/governance for AI-enabled offerings.",
    "- Propose at least one pilot Slalom UK & Ireland can run in the next 2-4 weeks.",
  ].join("\n");
}

function selectPersonaArtifacts(persona: PersonaProfile, artifacts: string[]): string[] {
  if (artifacts.length === 0) {
    return [];
  }

  const personaTokens = persona.name
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  const valueTokens = persona.values
    .flatMap((value) => value.toLowerCase().split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  const tokens = Array.from(new Set([...personaTokens, ...valueTokens]));
  const direct = artifacts.filter((item) => {
    const lowered = item.toLowerCase();
    return tokens.some((token) => lowered.includes(token));
  });

  return (direct.length > 0 ? direct : artifacts).slice(0, 12);
}

function buildPersonaRiskLine(persona: PersonaProfile, topic: string, reason: string): string {
  const riskTone =
    persona.riskPosture === "risk_averse"
      ? "high-confidence controls"
      : persona.riskPosture === "risk_tolerant"
        ? "explicit downside boundaries"
        : "balanced execution guardrails";
  return `${persona.name} emphasized ${riskTone} for ${topic}. Signal: ${toSentence(reason)}`;
}

function buildPersonaRecommendation(persona: PersonaProfile, topic: string, comment: string): string {
  const body = stripSpeakerPrefix(comment, persona.name);
  const summary = firstSentence(body) || `Prioritize concrete action on ${topic}.`;
  return `${summary} (${persona.name} recommendation on ${topic})`;
}

function buildPersonaChallengeQuestion(persona: PersonaProfile, topic: string): string {
  if (persona.consensusRole === "skeptic") {
    return `${persona.name}: What would falsify our assumptions on ${topic}?`;
  }
  if (persona.consensusRole === "driver") {
    return `${persona.name}: What recommendation on ${topic} can we pressure-test now with a named owner and date?`;
  }
  return `${persona.name}: Where is the best speed-control balance on ${topic} for this phase?`;
}

function buildPersonaOutput(persona: PersonaProfile, turns: PersonaTurn[]): PersonaDebateOutput {
  if (turns.length === 0) {
    const fallbackPosition = `${persona.name} has no recorded turn yet and recommends holding until additional evidence is surfaced.`;
    const fallbackInsights = [
      "Current transcript context is insufficient to add a differentiated recommendation without repeating prior statements.",
      "A targeted follow-up should focus on evidence quality, risk boundaries, and measurable execution criteria.",
    ];
    const fallbackAdvice = [
      "Invite one focused follow-up contribution once new data or dissenting evidence is available.",
    ];
    const fallbackQuestions = [
      "Which unresolved assumption should this member challenge first in the next turn?",
    ];
    const fallbackComment = buildStructuredComment({
      personaName: persona.name,
      position: fallbackPosition,
      insights: fallbackInsights,
      advice: fallbackAdvice,
      questions: fallbackQuestions,
    });

    return {
      personaId: persona.id,
      personaName: persona.name,
      comment: fallbackComment,
      comments: [fallbackComment],
      position: fallbackPosition,
      insights: fallbackInsights,
      advice: fallbackAdvice,
      questions: fallbackQuestions,
      interactionModes: ["build", "challenge"],
      viewpoint: `${persona.name} contributes a ${persona.lens.toLowerCase()} perspective with ${persona.decisionStyle.toLowerCase()}.`,
      thinkingSteps: ["No speaking turn committed yet; awaiting additional evidence."],
      risks: ["Potential signal loss if this perspective is never heard in the run."],
      recommendations: ["Queue a targeted follow-up turn with explicit evidence anchors."],
      challengeQuestions: fallbackQuestions,
      confidence: 0.45,
    };
  }

  const comments = turns.map((turn) => turn.comment).slice(0, 6);
  return {
    personaId: persona.id,
    personaName: persona.name,
    comment: comments[0] ?? `${persona.name}: No contribution recorded.`,
    comments,
    position: turns[0]?.position,
    insights: turns.flatMap((turn) => turn.insights).slice(0, 8),
    advice: turns.flatMap((turn) => turn.advice).slice(0, 6),
    questions: turns.flatMap((turn) => turn.questions).slice(0, 6),
    interactionModes: Array.from(new Set(turns.flatMap((turn) => turn.interactionModes))).slice(0, 6),
    viewpoint: `${persona.name} contributes a ${persona.lens.toLowerCase()} perspective with ${persona.decisionStyle.toLowerCase()}.`,
    thinkingSteps: turns.map((turn) => turn.thinkingStep).filter(Boolean).slice(0, 6),
    risks: turns.map((turn) => turn.risk).filter(Boolean).slice(0, 6),
    recommendations: turns.map((turn) => turn.recommendation).filter(Boolean).slice(0, 6),
    challengeQuestions: turns.map((turn) => turn.challengeQuestion).filter(Boolean).slice(0, 6),
    confidence:
      turns.length > 0 ? turns.reduce((sum, turn) => sum + turn.confidence, 0) / turns.length : 0.6,
  };
}

function normalizeRecommendations(
  recommendations: ConsensusSynthesis["recommendations"],
  fallback: ShadowBoardRecommendation[],
): ShadowBoardRecommendation[] {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return fallback;
  }

  const normalized: ShadowBoardRecommendation[] = [];
  for (const recommendation of recommendations) {
    normalized.push({
      theme: String(recommendation.theme ?? "Decision quality"),
      recommendation: String(
        recommendation.recommendation ??
          "Assign ownership, timeline, and success criteria before moving to full rollout.",
      ),
      rationale: String(
        recommendation.rationale ??
          "Board participants converged when ownership and evidence checkpoints were explicit.",
      ),
      risks: normalizeStringArray(recommendation.risks, 4),
      counterpoints: normalizeStringArray(recommendation.counterpoints, 4),
      confidence: clampNumber(recommendation.confidence ?? 0.72, 0, 1),
    });
  }

  return normalized.slice(0, 4);
}

function fallbackRecommendations(outputs: PersonaDebateOutput[]): ShadowBoardRecommendation[] {
  const hasRiskAverse = outputs.some(
    (item) => item.personaName === "Sophie Bailes" || item.personaName === "Constantin Beier",
  );
  const hasAccelerator = outputs.some(
    (item) => item.personaName === "Vivek Ganotra" || item.personaName === "Anthony Battle",
  );

  const recommendations: ShadowBoardRecommendation[] = [
    {
      theme: "Decision closure",
      recommendation:
        "Recommend a time-boxed pilot with one executive owner, dated checkpoint, and explicit success criteria.",
      rationale: "The board converges faster when owner and checkpoint obligations are explicit.",
      risks: ["Unclear accountability", "scope drift before evidence"],
      counterpoints: ["Over-specification can slow experimentation."],
      confidence: 0.78,
    },
    {
      theme: "Speed and control balance",
      recommendation: "Pair acceleration with control thresholds, rollback triggers, and disclosure readiness gates.",
      rationale: "Faster pilots remain viable when control boundaries are defined up front.",
      risks: ["Regulatory exposure", "execution bottlenecks"],
      counterpoints: ["Too many controls may reduce learning speed."],
      confidence: 0.74,
    },
  ];

  if (!hasRiskAverse || !hasAccelerator) {
    return recommendations.slice(0, 1);
  }

  return recommendations;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).slice(0, 200);
}

function lexicalSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  const union = tokensA.size + tokensB.size - intersection;
  if (union <= 0) {
    return 0;
  }

  return intersection / union;
}

function containsProhibitedPhrase(text: string): boolean {
  const lowered = text.toLowerCase();
  return PROHIBITED_GENERIC_PHRASES.some((phrase) => lowered.includes(phrase.toLowerCase()));
}

function isCommentTooSimilar(params: {
  comment: string;
  persona: PersonaProfile;
  transcript: string[];
  personaTurnHistory: string[];
}): boolean {
  const body = stripSpeakerPrefix(params.comment, params.persona.name);
  if (!body) {
    return true;
  }

  if (containsProhibitedPhrase(body)) {
    return true;
  }

  const comparisons = [
    ...params.transcript.slice(-20).map((line) => line.replace(/^\[Turn\s+\d+\]\s*/i, "")),
    ...params.personaTurnHistory.slice(-4),
  ];

  return comparisons.some((line) => lexicalSimilarity(body, line) >= 0.82);
}

function buildProfileDerivedComment(params: {
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  agenda: string;
  turnIndex: number;
}): MemberResponse {
  const fallback = buildDeterministicStructuredFallback({
    persona: params.persona,
    topic: params.topic,
    agenda: params.agenda,
    reason: `${params.persona.name} provided a deterministic fallback turn.`,
  });

  const body = formatStructuredTurn({
    personaName: params.persona.name,
    position: fallback.position,
    insights: fallback.insights,
    advice: fallback.advice,
    questions: fallback.questions,
  });

  return {
    comment: body,
    position: fallback.position,
    insights: fallback.insights,
    advice: fallback.advice,
    questions: fallback.questions,
    interactionModes: ["quantify", "operationalise", "challenge"],
    experienceReference: fallback.experienceReference,
    reason: `${params.persona.name} provided a profile-grounded contribution for ${params.topic} using ${params.profile.discArchetype || "board"} cues.`,
    confidence: 0.56,
    citations: [],
  };
}

function fallbackBid(params: {
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  turnIndex: number;
}): BoardTurnBid {
  const seedReason =
    params.profile.decisionHeuristics[params.turnIndex % Math.max(1, params.profile.decisionHeuristics.length)] ??
    `${params.persona.name} has a relevant perspective.`;

  return {
    personaId: params.persona.id,
    urgency_1_to_10: Math.round(clampNumber(5 + ((params.turnIndex + params.persona.id.length) % 4), 1, 10)),
    shouldSpeak: true,
    proposedComment: firstSentence(seedReason) || `${params.persona.name} should contribute on ${params.topic}.`,
    reason: `${params.persona.name}: ${toSentence(seedReason)}`,
    confidence: 0.56,
    citations: [],
  };
}

function normalizeBid(params: {
  raw: unknown;
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  turnIndex: number;
}): BoardTurnBid {
  const candidate = (params.raw ?? {}) as {
    urgency_1_to_10?: number;
    urgency?: number;
    shouldSpeak?: boolean;
    proposedComment?: string;
    comment?: string;
    reason?: string;
    interactionModes?: string[];
    confidence?: number;
    citations?: string[];
  };

  const fallback = fallbackBid({
    persona: params.persona,
    profile: params.profile,
    topic: params.topic,
    turnIndex: params.turnIndex,
  });

  const thesis =
    (typeof candidate.proposedComment === "string" && candidate.proposedComment.trim()) ||
    (typeof candidate.comment === "string" && candidate.comment.trim()) ||
    fallback.proposedComment;

  const interactionModes = normalizeStringArray(candidate.interactionModes, 6);
  const urgencyBoost = Math.min(2, interactionModes.length);
  return {
    personaId: params.persona.id,
    urgency_1_to_10: Math.round(
      clampNumber((candidate.urgency_1_to_10 ?? candidate.urgency ?? fallback.urgency_1_to_10) + urgencyBoost, 1, 10),
    ),
    shouldSpeak: typeof candidate.shouldSpeak === "boolean" ? candidate.shouldSpeak : true,
    proposedComment: firstSentence(thesis) || fallback.proposedComment,
    reason:
      (typeof candidate.reason === "string" && candidate.reason.trim()) ||
      fallback.reason ||
      `${params.persona.name} can clarify tradeoffs on ${params.topic}.`,
    confidence: clampNumber(candidate.confidence ?? fallback.confidence, 0, 1),
    citations: normalizeStringArray(candidate.citations, 8),
  };
}

function buildStructuredComment(params: {
  personaName: string;
  position: string;
  insights: string[];
  advice: string[];
  questions: string[];
}): string {
  return formatStructuredTurn({
    personaName: params.personaName,
    position: params.position,
    insights: params.insights,
    advice: params.advice,
    questions: params.questions,
  });
}

function toTurnTranscriptBlock(turnNumber: number, comment: string): string {
  const lines = comment.split(/\r?\n/);
  if (lines.length === 0) {
    return `[Turn ${turnNumber}]`;
  }
  return [`[Turn ${turnNumber}] ${lines[0]}`, ...lines.slice(1)].join("\n");
}

async function rebuildMemberAgentProfiles(force: boolean): Promise<boolean> {
  const scriptPath = path.join(process.cwd(), "scripts", "build_member_agent_profiles.py");
  const pythonCandidates = ["python3", "python"];

  for (const python of pythonCandidates) {
    try {
      await execFileAsync(
        python,
        [scriptPath, ...(force ? ["--force"] : [])],
        {
          cwd: process.cwd(),
          timeout: 180_000,
        },
      );
      return true;
    } catch {
      // try next runtime
    }
  }

  return false;
}

async function loadProfilePackWithRefresh(warnings: string[]): Promise<{
  pack: { generatedAt: string; profiles: BoardMemberAgentProfile[] } | null;
}> {
  let pack = await getBoardMemberProfilePack();
  const stale = await isBoardMemberProfilePackStale();

  if (!pack || stale) {
    const rebuilt = await rebuildMemberAgentProfiles(true);
    if (!rebuilt) {
      warnings.push(
        "Board-member profile refresh failed to execute scripts/build_member_agent_profiles.py; using existing local profile pack if available.",
      );
    }
    pack = await getBoardMemberProfilePack();
  }

  return { pack };
}

async function publishRunEvent(
  run: ShadowBoardRun,
  type: ShadowBoardRunEvent["type"],
  payload: ShadowBoardRunEvent["payload"] = {},
): Promise<void> {
  await publishShadowBoardEvent({
    eventId: `shadow-event-${randomUUID()}`,
    runId: run.runId,
    shadowSessionId: run.shadowSessionId,
    type,
    createdAt: new Date().toISOString(),
    payload: {
      ...payload,
      run,
    },
  });
}

async function gatherPersonaRagEvidence(params: {
  persona: PersonaProfile;
  topic: string;
  agenda: string;
  topics: string[];
  transcript: string[];
  documentIds: string[];
}): Promise<string[]> {
  if (params.documentIds.length === 0) {
    return [];
  }

  try {
    const server = await ensureLocalRagMcpConnected();
    const searchResult = (await server.callTool("rag.search", {
      query: [
        params.agenda,
        params.topic,
        params.topics.join("; "),
        params.transcript.slice(-12).join(" "),
      ]
        .filter(Boolean)
        .join("\n"),
      limit: 10,
      person: params.persona.name,
      doc_ids: params.documentIds,
    })) as {
      structuredContent?: { results?: Array<{ text?: string; source_path?: string }> };
      content?: Array<{ type?: string; text?: string }>;
    };

    const structuredResults = searchResult.structuredContent?.results ?? [];
    if (Array.isArray(structuredResults) && structuredResults.length > 0) {
      return normalizeStringArray(
        structuredResults.map((result) => `${result.text ?? ""}${result.source_path ? ` (${result.source_path})` : ""}`),
        16,
      );
    }

    const textBlob = (searchResult.content ?? [])
      .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
      .join("\n");
    const parsed = parseJsonFromText<{ results?: Array<{ text?: string; source_path?: string }> }>(textBlob);
    if (!parsed || !Array.isArray(parsed.results)) {
      return [];
    }

    return normalizeStringArray(
      parsed.results.map((result) => `${result.text ?? ""}${result.source_path ? ` (${result.source_path})` : ""}`),
      16,
    );
  } catch {
    return [];
  }
}

async function generatePersonaBid(params: {
  runId: string;
  shadowSessionId: string;
  turnIndex: number;
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  agendaItemContext: string;
  agenda: string;
  topics: string[];
  transcript: string[];
  artifacts: string[];
  personaArtifacts: string[];
  reasoningLevel: number;
  randomness: number;
}): Promise<BoardTurnBid> {
  if (!hasOpenAiKey()) {
    return fallbackBid({
      persona: params.persona,
      profile: params.profile,
      topic: params.topic,
      turnIndex: params.turnIndex,
    });
  }

  try {
    const agent = getOrCreateShadowMemberAgent({
      shadowSessionId: params.shadowSessionId,
      persona: params.persona,
      profile: params.profile,
    });

    const runner = createAgentRunner({
      workflowName: "shadow_board_member_bid",
      groupId: params.runId,
    });

    const response = await withTimeout(
      runner.run(
        agent,
        [
          `Round: ${params.turnIndex + 1}`,
          `Agenda: ${params.agenda}`,
          `Topic focus: ${params.topic}`,
          params.agendaItemContext,
          `Reasoning level (1-10): ${params.reasoningLevel}`,
          `Randomness setting (0-1): ${params.randomness.toFixed(2)}`,
          "Task:",
          "1) Review the full transcript and evidence.",
          "2) Decide if you should speak next.",
          "3) Return urgency, rationale, one concise thesis, and intended interactionModes.",
          "4) InteractionModes must include at least two items from: build, challenge, bridge, quantify, operationalise, scenario.",
          "Topics:",
          params.topics.map((topic) => `- ${topic}`).join("\n"),
          buildAiDepthGuidance(params.agenda, params.topics),
          "Evidence:",
          params.artifacts.length > 0 ? params.artifacts.map((item) => `- ${item}`).join("\n") : "- none",
          "Persona-priority evidence:",
          params.personaArtifacts.length > 0
            ? params.personaArtifacts.map((item) => `- ${item}`).join("\n")
            : "- none",
          "Recent transcript:",
          params.transcript.slice(-60).map((line) => `- ${line}`).join("\n"),
          "Return JSON only with schema:",
          '{"personaId":"string","urgency_1_to_10":1,"shouldSpeak":true,"proposedComment":"string","interactionModes":["build"],"reason":"string","confidence":0.0,"citations":["string"]}',
        ].join("\n\n"),
        {
          maxTurns: 6,
        },
      ),
      45_000,
      "shadow_board_member_bid",
    );

    const raw = typeof response.finalOutput === "string" ? response.finalOutput : JSON.stringify(response.finalOutput ?? {});
    const parsed = parseJsonFromText<BoardTurnBid>(raw);

    return normalizeBid({
      raw: parsed,
      persona: params.persona,
      profile: params.profile,
      topic: params.topic,
      turnIndex: params.turnIndex,
    });
  } catch {
    return fallbackBid({
      persona: params.persona,
      profile: params.profile,
      topic: params.topic,
      turnIndex: params.turnIndex,
    });
  }
}

async function runPersonaCommentAttempt(params: {
  runId: string;
  workflowName: "shadow_board_opening_turn" | "shadow_board_member_speak";
  shadowSessionId: string;
  turnIndex: number;
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  agendaItemContext: string;
  agenda: string;
  topics: string[];
  transcript: string[];
  artifacts: string[];
  personaArtifacts: string[];
  reasoningLevel: number;
  randomness: number;
  selectedBid?: BoardTurnBid;
  forceNovelty: boolean;
  validationFeedback?: string;
}): Promise<MemberResponse | null> {
  if (!hasOpenAiKey()) {
    return null;
  }

  try {
    const agent = getOrCreateShadowMemberAgent({
      shadowSessionId: params.shadowSessionId,
      persona: params.persona,
      profile: params.profile,
    });

    const runner = createAgentRunner({
      workflowName: params.workflowName,
      groupId: params.runId,
    });

    const noveltyGuard = params.forceNovelty
      ? "Your previous draft was too similar to existing transcript wording. Rewrite with a distinct argument structure and new evidence framing."
      : "Add at least one novel point not already made in the last 20 transcript lines.";

    const response = await withTimeout(
      runner.run(
        agent,
        [
          `Round: ${params.turnIndex + 1}`,
          `Agenda: ${params.agenda}`,
          `Topic focus: ${params.topic}`,
          params.agendaItemContext,
          `Reasoning level (1-10): ${params.reasoningLevel}`,
          `Randomness setting (0-1): ${params.randomness.toFixed(2)}`,
          params.selectedBid
            ? `Selected to speak because: ${params.selectedBid.reason} (urgency ${params.selectedBid.urgency_1_to_10}/10)`
            : "You are the opening speaker for this run.",
          noveltyGuard,
          "Role and objective:",
          "- You are simulating Slalom UK & Ireland advisory-board dialogue.",
          "- Keep persona consistency, but focus 80-90% of output on agenda substance.",
          "- Do not use decision language unless explicitly asked for a decision.",
          "Turn structure (mandatory):",
          "- position: exactly 1 sentence",
          "- insights: 2-5 bullets",
          "- advice: 1-3 bullets",
          "- questions: 1-2 bullets",
          "- interactionModes: at least two from build, challenge, bridge, quantify, operationalise, scenario",
          "- experienceReference optional and max one sentence",
          params.validationFeedback ? `Validation feedback from prior draft:\n${params.validationFeedback}` : "",
          "Topics:",
          params.topics.map((topic) => `- ${topic}`).join("\n"),
          buildAiDepthGuidance(params.agenda, params.topics),
          "Evidence:",
          params.artifacts.length > 0 ? params.artifacts.map((item) => `- ${item}`).join("\n") : "- none",
          "Persona-priority evidence:",
          params.personaArtifacts.length > 0
            ? params.personaArtifacts.map((item) => `- ${item}`).join("\n")
            : "- none",
          "Recent transcript:",
          params.transcript.slice(-80).map((line) => `- ${line}`).join("\n"),
          "Return JSON only with schema:",
          '{"position":"string","insights":["string"],"advice":["string"],"questions":["string"],"interactionModes":["build"],"experienceReference":"string","reason":"string","confidence":0.0,"citations":["string"]}',
        ].join("\n\n"),
        {
          maxTurns: 8,
        },
      ),
      45_000,
      params.workflowName,
    );

    const raw = typeof response.finalOutput === "string" ? response.finalOutput : JSON.stringify(response.finalOutput ?? {});
    const parsed = parseJsonFromText<{
      position?: string;
      insights?: string[];
      advice?: string[];
      questions?: string[];
      interactionModes?: string[];
      experienceReference?: string;
      reason?: string;
      confidence?: number;
      citations?: string[];
    }>(raw);

    if (!parsed) {
      return null;
    }

    const candidate: StructuredTurnCandidate = {
      position: typeof parsed.position === "string" ? parsed.position : "",
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      advice: Array.isArray(parsed.advice) ? parsed.advice : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      interactionModes: Array.isArray(parsed.interactionModes) ? parsed.interactionModes : [],
      experienceReference: typeof parsed.experienceReference === "string" ? parsed.experienceReference : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      confidence: parsed.confidence,
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    };

    const position = toSentence(candidate.position ?? "");
    const insights = normalizeStringArray(candidate.insights, 5);
    const advice = normalizeStringArray(candidate.advice, 3);
    const questions = normalizeStringArray(candidate.questions, 2);
    const interactionModes = normalizeStringArray(candidate.interactionModes, 6).map((item) => item.toLowerCase());
    if (!position || insights.length === 0 || advice.length === 0 || questions.length === 0) {
      return null;
    }

    return {
      comment: buildStructuredComment({
        personaName: params.persona.name,
        position,
        insights,
        advice,
        questions,
      }),
      position,
      insights,
      advice,
      questions,
      interactionModes: interactionModes as InteractionMode[],
      experienceReference: candidate.experienceReference,
      reason:
        (typeof candidate.reason === "string" && candidate.reason.trim()) ||
        `${params.persona.name} provided a perspective on ${params.topic}.`,
      confidence: clampNumber(candidate.confidence ?? 0.72, 0, 1),
      citations: normalizeStringArray(candidate.citations, 10),
    };
  } catch {
    return null;
  }
}

async function generatePersonaComment(params: {
  runId: string;
  workflowName: "shadow_board_opening_turn" | "shadow_board_member_speak";
  shadowSessionId: string;
  turnIndex: number;
  persona: PersonaProfile;
  profile: BoardMemberAgentProfile;
  topic: string;
  agendaItemContext: string;
  agenda: string;
  topics: string[];
  transcript: string[];
  artifacts: string[];
  personaArtifacts: string[];
  reasoningLevel: number;
  randomness: number;
  selectedBid?: BoardTurnBid;
  personaTurnHistory: string[];
}): Promise<MemberResponse> {
  const generated = await runPersonaCommentAttempt({
    ...params,
    forceNovelty: false,
    validationFeedback: undefined,
  });

  if (!generated) {
    return buildProfileDerivedComment({
      persona: params.persona,
      profile: params.profile,
      topic: params.topic,
      agenda: params.agenda,
      turnIndex: params.turnIndex,
    });
  }

  const normalizedFirst = normalizeStructuredTurnWordRange({
    position: generated.position,
    insights: generated.insights,
    advice: generated.advice,
    questions: generated.questions,
    experienceReference: generated.experienceReference,
    agenda: params.agenda,
    topic: params.topic,
  });

  const firstCandidate: MemberResponse = {
    ...generated,
    comment: buildStructuredComment({
      personaName: params.persona.name,
      position: normalizedFirst.position,
      insights: normalizedFirst.insights,
      advice: normalizedFirst.advice,
      questions: normalizedFirst.questions,
    }),
    position: normalizedFirst.position,
    insights: normalizedFirst.insights,
    advice: normalizedFirst.advice,
    questions: normalizedFirst.questions,
    experienceReference: normalizedFirst.experienceReference,
  };

  const firstValidation = validateTurn(
    {
      position: firstCandidate.position,
      insights: firstCandidate.insights,
      advice: firstCandidate.advice,
      questions: firstCandidate.questions,
      interactionModes: firstCandidate.interactionModes,
      experienceReference: firstCandidate.experienceReference,
    },
    {
      persona: params.persona,
      agenda: params.agenda,
      topic: params.topic,
      transcript: params.transcript,
    },
  );

  if (
    firstValidation.valid &&
    !isCommentTooSimilar({
      comment: firstCandidate.comment,
      persona: params.persona,
      transcript: params.transcript,
      personaTurnHistory: params.personaTurnHistory,
    })
  ) {
    return firstCandidate;
  }

  const feedback = firstValidation.valid
    ? "Prior draft was overly similar to transcript. Keep structure and add new specific insights."
    : `Fix these violations:\n- ${firstValidation.violations.join("\n- ")}`;

  const regenerated = await runPersonaCommentAttempt({
    ...params,
    forceNovelty: true,
    validationFeedback: feedback,
  });

  const secondCandidate = regenerated
    ? (() => {
        const normalizedSecond = normalizeStructuredTurnWordRange({
          position: regenerated.position,
          insights: regenerated.insights,
          advice: regenerated.advice,
          questions: regenerated.questions,
          experienceReference: regenerated.experienceReference,
          agenda: params.agenda,
          topic: params.topic,
        });

        return {
          ...regenerated,
          comment: buildStructuredComment({
            personaName: params.persona.name,
            position: normalizedSecond.position,
            insights: normalizedSecond.insights,
            advice: normalizedSecond.advice,
            questions: normalizedSecond.questions,
          }),
          position: normalizedSecond.position,
          insights: normalizedSecond.insights,
          advice: normalizedSecond.advice,
          questions: normalizedSecond.questions,
          experienceReference: normalizedSecond.experienceReference,
        };
      })()
    : null;

  const secondValidation = secondCandidate
    ? validateTurn(
        {
          position: secondCandidate.position,
          insights: secondCandidate.insights,
          advice: secondCandidate.advice,
          questions: secondCandidate.questions,
          interactionModes: secondCandidate.interactionModes,
          experienceReference: secondCandidate.experienceReference,
        },
        {
          persona: params.persona,
          agenda: params.agenda,
          topic: params.topic,
          transcript: params.transcript,
        },
      )
    : null;

  if (
    secondCandidate &&
    secondValidation?.valid &&
    !isCommentTooSimilar({
      comment: secondCandidate.comment,
      persona: params.persona,
      transcript: params.transcript,
      personaTurnHistory: params.personaTurnHistory,
    })
  ) {
    return secondCandidate;
  }

  const fallbackStructured = buildDeterministicStructuredFallback({
    persona: params.persona,
    topic: params.topic,
    agenda: params.agenda,
    reason: `${params.persona.name} fallback due to validation or novelty constraints.`,
  });

  const fallback: MemberResponse = {
    comment: buildStructuredComment({
      personaName: params.persona.name,
      position: fallbackStructured.position,
      insights: fallbackStructured.insights,
      advice: fallbackStructured.advice,
      questions: fallbackStructured.questions,
    }),
    position: fallbackStructured.position,
    insights: fallbackStructured.insights,
    advice: fallbackStructured.advice,
    questions: fallbackStructured.questions,
    interactionModes: ["quantify", "operationalise", "challenge"],
    experienceReference: fallbackStructured.experienceReference,
    reason: fallbackStructured.reason ?? `${params.persona.name} fallback turn`,
    confidence: fallbackStructured.confidence ?? 0.55,
    citations: fallbackStructured.citations ?? [],
  };

  const violationMessages = [
    ...(!firstValidation.valid ? firstValidation.violations : []),
    ...(secondValidation && !secondValidation.valid ? secondValidation.violations : []),
  ];

  return {
    ...fallback,
    repetitionWarning:
      violationMessages.length > 0
        ? `${params.persona.name} turn required deterministic fallback after policy checks: ${Array.from(
            new Set(violationMessages),
          ).join(" | ")}`
        : `${params.persona.name} produced high-overlap wording; deterministic fallback applied.`,
  };
}

async function synthesizeConsensus(params: {
  runId: string;
  agenda: string;
  topics: string[];
  transcript: string[];
  outputs: PersonaDebateOutput[];
  fallback: ShadowBoardRecommendation[];
}): Promise<{
  consensusSummary: string;
  dissentSummary: string;
  recommendations: ShadowBoardRecommendation[];
}> {
  const fallbackConsensus =
    "Consensus: The board aligned on a phased path with explicit ownership, timeline, and checkpoint criteria.";
  const fallbackDissent =
    "Dissent: Remaining tension is primarily around innovation speed versus governance safeguards.";

  const parsed = await runJsonModel<ConsensusSynthesis>(
    {
      model: config.modelShadowBoard,
      feature: "shadow_board_consensus",
      workflowName: "shadow_board_consensus",
      groupId: params.runId,
      systemPrompt:
        "Synthesize board consensus and dissent for an advisory-board discussion. Keep recommendations concrete with ownership and checkpoints, but avoid decision decrees. Return JSON only.",
      userPrompt: [
        `Agenda: ${params.agenda}`,
        `Topics: ${params.topics.join("; ")}`,
        "Transcript:",
        params.transcript.slice(-140).map((item) => `- ${item}`).join("\n"),
        "Output schema:",
        '{"consensusSummary":"string","dissentSummary":"string","recommendations":[{"theme":"string","recommendation":"string","rationale":"string","risks":["string"],"counterpoints":["string"],"confidence":0.0}] }',
      ].join("\n\n"),
    },
    {
      consensusSummary: fallbackConsensus,
      dissentSummary: fallbackDissent,
      recommendations: params.fallback,
    },
  );

  return {
    consensusSummary: (parsed.consensusSummary ?? "").trim() || fallbackConsensus,
    dissentSummary: (parsed.dissentSummary ?? "").trim() || fallbackDissent,
    recommendations: normalizeRecommendations(parsed.recommendations, params.fallback),
  };
}

function buildInitialRunRecord(input: RunInput): ShadowBoardRun {
  const runId = `shadow-${randomUUID()}`;
  const shadowSessionId = normalizeShadowSessionId(input.shadowSessionId, runId);
  const controls = normalizeShadowBoardControls({
    reasoningLevel: input.reasoningLevel,
    maxConversationTurns: input.maxConversationTurns,
    randomness: input.randomness,
  });

  return {
    runId,
    shadowSessionId,
    agenda: input.agenda,
    topics: input.topics,
    agendaItems: normalizeAgendaItems({
      agenda: input.agenda,
      topics: input.topics,
      agendaItems: input.agendaItems,
    }),
    personaIds: input.personaIds,
    meetingId: input.meetingId,
    documentIds: normalizeStringArray(input.documentIds, 300),
    controls: {
      ...controls,
    },
    meetingArtifacts: normalizeStringArray(input.meetingArtifacts, 40),
    outputFormat: input.outputFormat ?? "markdown",
    targetWordCount: Math.max(150, Math.min(4000, input.targetWordCount ?? 600)),
    sharedTranscript: normalizeStringArray(input.transcriptSeed, 80),
    turnMeta: [],
    status: "running",
    startedAt: new Date().toISOString(),
    outputs: [],
    turnBids: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
    skippedPersonaIds: [],
    warnings: [],
  };
}

function scheduleShadowRun(task: () => Promise<void>): void {
  void task();
}

async function executeShadowBoardRun(runRecord: ShadowBoardRun, input: RunInput): Promise<ShadowBoardRun> {
  const run: ShadowBoardRun = {
    ...runRecord,
  };

  const controls = normalizeShadowBoardControls({
    reasoningLevel: input.reasoningLevel,
    maxConversationTurns: input.maxConversationTurns,
    randomness: input.randomness,
  });
  const reasoningLevel = controls.reasoningLevel;
  const maxConversationTurns = controls.maxConversationTurns;
  const randomness = controls.randomness;

  const transcriptSeed = normalizeStringArray(input.transcriptSeed, 80);
  const documentIds = normalizeStringArray(input.documentIds, 300);
  const meetingArtifacts = normalizeStringArray(input.meetingArtifacts, 40);

  try {
    const selectedPersonas = (await getPersonas()).filter((persona) => input.personaIds.includes(persona.id));

    if (selectedPersonas.length === 0) {
      throw new Error("No speaking personas selected for shadow board run.");
    }

    const warnings: string[] = [];
    const { pack } = await loadProfilePackWithRefresh(warnings);
    if (!pack || pack.profiles.length === 0) {
      throw new Error(
        "Board-member agent profiles are missing. Run /api/documents/ingest/bootstrap or scripts/build_member_agent_profiles.py --force.",
      );
    }

    const profileByPersonaId = mapProfilesByPersonaId(pack.profiles);
    const skippedPersonas = selectedPersonas.filter((persona) => !profileByPersonaId.has(persona.id));
    const speakingPersonas = selectedPersonas.filter((persona) => profileByPersonaId.has(persona.id));

    for (const skipped of skippedPersonas) {
      warnings.push(`Skipped ${skipped.name}: missing generated member profile.`);
    }

    if (speakingPersonas.length < MIN_SPEAKING_QUORUM) {
      throw new Error(
        `Insufficient speaking quorum after profile validation: ${speakingPersonas.length} available; requires at least ${MIN_SPEAKING_QUORUM}.`,
      );
    }

    const docs = (await Promise.all(documentIds.map((id) => getDocumentById(id)))).filter(
      (doc): doc is NonNullable<typeof doc> => Boolean(doc),
    );
    const baseArtifacts = [...meetingArtifacts, ...docs.map((doc) => `${doc.title} (${doc.sourcePath})`)].slice(0, 80);

    const sharedTranscript =
      transcriptSeed.length > 0
        ? [...transcriptSeed]
        : [`Board Chair: Agenda - ${input.agenda}`, `Board Chair: Focus topics - ${(input.topics ?? []).join("; ")}`];

    if (baseArtifacts.length > 0) {
      sharedTranscript.push(`Board Chair: ${baseArtifacts.length} supporting artifacts were reviewed.`);
    }

    run.sharedTranscript = sharedTranscript;
    run.documentIds = documentIds;
    run.meetingArtifacts = baseArtifacts;
    run.skippedPersonaIds = skippedPersonas.map((persona) => persona.id);
    run.warnings = warnings;
    await updateShadowBoardRun(run);

    for (const warning of warnings) {
      await publishRunEvent(run, "run_warning", { message: warning });
    }

    const turnCounts = new Map<string, number>();
    const lastSpokenAt = new Map<string, number>();
    const turnsByPersona = new Map<string, PersonaTurn[]>();
    const allBids: BoardTurnBid[] = [];
    const turnMeta: ShadowBoardTurnMeta[] = [];

    for (const persona of speakingPersonas) {
      turnCounts.set(persona.id, 0);
      turnsByPersona.set(persona.id, []);
    }

    const normalizedAgendaItems = normalizeAgendaItems({
      agenda: input.agenda,
      topics: input.topics,
      agendaItems: input.agendaItems,
    });
    const plannedAgendaItems = allocateTurnsForAgendaItems(maxConversationTurns, normalizedAgendaItems);
    const turnSchedule = buildAgendaTurnSchedule(plannedAgendaItems, maxConversationTurns);
    const topicList = plannedAgendaItems.map((item) => item.title);
    run.agendaItems = plannedAgendaItems;
    if (transcriptSeed.length === 0 && sharedTranscript.length >= 2) {
      sharedTranscript[1] = `Board Chair: Focus topics - ${topicList.join("; ")}`;
    }

    const opener = speakingPersonas[Math.floor(Math.random() * speakingPersonas.length)] ?? speakingPersonas[0];
    if (!opener) {
      throw new Error("Unable to select opening speaker.");
    }

    run.firstSpeakerPersonaId = opener.id;
    await updateShadowBoardRun(run);

    const openingAgendaItem = turnSchedule[0] ?? plannedAgendaItems[0];
    const openingTopic = openingAgendaItem?.title ?? topicList[0] ?? input.agenda;
    const openingAgendaContext = openingAgendaItem
      ? buildAgendaItemPromptContext(openingAgendaItem)
      : "Current agenda item: general discussion";
    await publishRunEvent(run, "turn_started", {
      turnIndex: 1,
      topic: openingTopic,
      speakerPersonaId: opener.id,
      speakerName: opener.name,
    });

    const openerProfile = profileByPersonaId.get(opener.id);
    if (!openerProfile) {
      throw new Error(`Profile missing for opening speaker ${opener.name}.`);
    }

    const openerEvidence = await gatherPersonaRagEvidence({
      persona: opener,
      topic: openingTopic,
      agenda: input.agenda,
      topics: topicList,
      transcript: sharedTranscript,
      documentIds,
    });

    const openerArtifacts = [...baseArtifacts, ...openerEvidence].slice(0, 100);
    const openerPersonaArtifacts = selectPersonaArtifacts(opener, openerArtifacts);

    const openingResponse = await generatePersonaComment({
      runId: run.runId,
      workflowName: "shadow_board_opening_turn",
      shadowSessionId: run.shadowSessionId ?? `${DEFAULT_SHADOW_SESSION_ID}-${run.runId}`,
      turnIndex: 0,
      persona: opener,
      profile: openerProfile,
      topic: openingTopic,
      agendaItemContext: openingAgendaContext,
      agenda: input.agenda,
      topics: topicList,
      transcript: sharedTranscript,
      artifacts: openerArtifacts,
      personaArtifacts: openerPersonaArtifacts,
      reasoningLevel,
      randomness,
      personaTurnHistory: [],
    });

    const openingComment = openingResponse.comment;
    const openingLine = toTurnTranscriptBlock(1, openingComment);
    sharedTranscript.push(openingLine);
    if (sharedTranscript.length > MAX_TRANSCRIPT_LINES) {
      sharedTranscript.splice(0, sharedTranscript.length - MAX_TRANSCRIPT_LINES);
    }

    const openingTurn: PersonaTurn = {
      personaId: opener.id,
      personaName: opener.name,
      comment: openingComment,
      position: openingResponse.position,
      insights: openingResponse.insights,
      advice: openingResponse.advice,
      questions: openingResponse.questions,
      interactionModes: openingResponse.interactionModes,
      thinkingStep: toSentence(openingResponse.reason),
      risk: buildPersonaRiskLine(opener, openingTopic, openingResponse.reason),
      recommendation: buildPersonaRecommendation(opener, openingTopic, openingComment),
      challengeQuestion: buildPersonaChallengeQuestion(opener, openingTopic),
      confidence: openingResponse.confidence,
      round: 1,
    };

    turnsByPersona.set(opener.id, [openingTurn]);
    turnCounts.set(opener.id, 1);
    lastSpokenAt.set(opener.id, 0);

    allBids.push({
      personaId: opener.id,
      urgency_1_to_10: 10,
      shouldSpeak: true,
      proposedComment: firstSentence(openingResponse.position) || `${opener.name} opens the meeting.`,
      reason: openingResponse.reason,
      confidence: openingResponse.confidence,
      citations: openingResponse.citations,
    });

    if (openingResponse.repetitionWarning) {
      run.warnings = [...(run.warnings ?? []), openingResponse.repetitionWarning];
      await publishRunEvent(run, "run_warning", { message: openingResponse.repetitionWarning });
    }

    run.sharedTranscript = [...sharedTranscript];
    run.turnBids = [...allBids];
    if (openingAgendaItem) {
      turnMeta.push({
        turnIndex: 1,
        agendaItemId: openingAgendaItem.id,
        topic: openingTopic,
        speakerPersonaId: opener.id,
      });
    }
    run.turnMeta = [...turnMeta];
    run.outputs = speakingPersonas.map((persona) => buildPersonaOutput(persona, turnsByPersona.get(persona.id) ?? []));
    await updateShadowBoardRun(run);
    await publishRunEvent(run, "turn_committed", {
      turnIndex: 1,
      topic: openingTopic,
      speakerPersonaId: opener.id,
      speakerName: opener.name,
      transcriptLine: openingLine,
    });

    for (let turnIndex = 1; turnIndex < maxConversationTurns; turnIndex += 1) {
      const activeAgendaItem = turnSchedule[turnIndex] ?? plannedAgendaItems[turnIndex % plannedAgendaItems.length];
      const topic = activeAgendaItem?.title ?? topicList[turnIndex % topicList.length] ?? input.agenda;
      const agendaItemContext = activeAgendaItem
        ? buildAgendaItemPromptContext(activeAgendaItem)
        : "Current agenda item: general discussion";
      await publishRunEvent(run, "turn_started", {
        turnIndex: turnIndex + 1,
        topic,
      });

      const evidenceByPersonaId = new Map<string, string[]>();

      const bids = await Promise.all(
        speakingPersonas.map(async (persona) => {
          const profile = profileByPersonaId.get(persona.id);
          if (!profile) {
            return null;
          }

          const evidence = await gatherPersonaRagEvidence({
            persona,
            topic,
            agenda: input.agenda,
            topics: topicList,
            transcript: sharedTranscript,
            documentIds,
          });
          evidenceByPersonaId.set(persona.id, evidence);

          const artifacts = [...baseArtifacts, ...evidence].slice(0, 100);
          const personaArtifacts = selectPersonaArtifacts(persona, artifacts);

          return generatePersonaBid({
            runId: run.runId,
            shadowSessionId: run.shadowSessionId ?? `${DEFAULT_SHADOW_SESSION_ID}-${run.runId}`,
            turnIndex,
            persona,
            profile,
            topic,
            agendaItemContext,
            agenda: input.agenda,
            topics: topicList,
            transcript: sharedTranscript,
            artifacts,
            personaArtifacts,
            reasoningLevel,
            randomness,
          });
        }),
      );

      const validBids = bids.filter((bid): bid is BoardTurnBid => Boolean(bid));
      allBids.push(...validBids);

      const selectedBid = selectNextSpeakerBid(validBids, {
        turnCounts,
        lastSpokenAt,
        turnIndex,
      });

      if (!selectedBid) {
        break;
      }

      const speaker = speakingPersonas.find((persona) => persona.id === selectedBid.personaId);
      if (!speaker) {
        continue;
      }

      const speakerProfile = profileByPersonaId.get(speaker.id);
      if (!speakerProfile) {
        continue;
      }

      const speakerEvidence = evidenceByPersonaId.get(speaker.id) ?? [];
      const speakerArtifacts = [...baseArtifacts, ...speakerEvidence].slice(0, 100);
      const speakerPersonaArtifacts = selectPersonaArtifacts(speaker, speakerArtifacts);

      const priorSpeakerTurns = (turnsByPersona.get(speaker.id) ?? []).map((turn) => turn.comment);

      const response = await generatePersonaComment({
        runId: run.runId,
        workflowName: "shadow_board_member_speak",
        shadowSessionId: run.shadowSessionId ?? `${DEFAULT_SHADOW_SESSION_ID}-${run.runId}`,
        turnIndex,
        persona: speaker,
        profile: speakerProfile,
        topic,
        agendaItemContext,
        agenda: input.agenda,
        topics: topicList,
        transcript: sharedTranscript,
        artifacts: speakerArtifacts,
        personaArtifacts: speakerPersonaArtifacts,
        reasoningLevel,
        randomness,
        selectedBid,
        personaTurnHistory: priorSpeakerTurns,
      });

      const normalizedComment = response.comment;
      const transcriptLine = toTurnTranscriptBlock(turnIndex + 1, normalizedComment);

      const turn: PersonaTurn = {
        personaId: speaker.id,
        personaName: speaker.name,
        comment: normalizedComment,
        position: response.position,
        insights: response.insights,
        advice: response.advice,
        questions: response.questions,
        interactionModes: response.interactionModes,
        thinkingStep: toSentence(response.reason),
        risk: buildPersonaRiskLine(speaker, topic, response.reason),
        recommendation: buildPersonaRecommendation(speaker, topic, normalizedComment),
        challengeQuestion: buildPersonaChallengeQuestion(speaker, topic),
        confidence: response.confidence,
        round: turnIndex + 1,
      };

      const currentTurns = turnsByPersona.get(speaker.id) ?? [];
      currentTurns.push(turn);
      turnsByPersona.set(speaker.id, currentTurns);

      turnCounts.set(speaker.id, (turnCounts.get(speaker.id) ?? 0) + 1);
      lastSpokenAt.set(speaker.id, turnIndex);

      sharedTranscript.push(transcriptLine);
      if (sharedTranscript.length > MAX_TRANSCRIPT_LINES) {
        sharedTranscript.splice(0, sharedTranscript.length - MAX_TRANSCRIPT_LINES);
      }

      if (response.repetitionWarning) {
        run.warnings = [...(run.warnings ?? []), response.repetitionWarning];
        await publishRunEvent(run, "run_warning", { message: response.repetitionWarning });
      }

      run.sharedTranscript = [...sharedTranscript];
      run.turnBids = [...allBids];
      if (activeAgendaItem) {
        turnMeta.push({
          turnIndex: turnIndex + 1,
          agendaItemId: activeAgendaItem.id,
          topic,
          speakerPersonaId: speaker.id,
        });
      }
      run.turnMeta = [...turnMeta];
      run.outputs = speakingPersonas.map((persona) => buildPersonaOutput(persona, turnsByPersona.get(persona.id) ?? []));
      await updateShadowBoardRun(run);
      await publishRunEvent(run, "turn_committed", {
        turnIndex: turnIndex + 1,
        topic,
        speakerPersonaId: speaker.id,
        speakerName: speaker.name,
        transcriptLine,
      });

      const lowUrgency = validBids.filter((bid) => bid.urgency_1_to_10 <= 3).length;
      if (turnIndex >= speakingPersonas.length * 2 && lowUrgency >= Math.ceil(speakingPersonas.length * 0.7)) {
        sharedTranscript.push("Board Chair: Urgency appears to be tapering. Moving to synthesis.");
        if (sharedTranscript.length > MAX_TRANSCRIPT_LINES) {
          sharedTranscript.splice(0, sharedTranscript.length - MAX_TRANSCRIPT_LINES);
        }
        run.sharedTranscript = [...sharedTranscript];
        await updateShadowBoardRun(run);
        break;
      }
    }

    const outputs = speakingPersonas.map((persona) => buildPersonaOutput(persona, turnsByPersona.get(persona.id) ?? []));
    const fallback = fallbackRecommendations(outputs);
    const consensus = await synthesizeConsensus({
      runId: run.runId,
      agenda: input.agenda,
      topics: topicList,
      transcript: sharedTranscript,
      outputs,
      fallback,
    });

    const completed: ShadowBoardRun = {
      ...run,
      status: "completed",
      finishedAt: new Date().toISOString(),
      outputs,
      turnBids: allBids,
      recommendations: consensus.recommendations,
      consensusSummary: consensus.consensusSummary,
      dissentSummary: consensus.dissentSummary,
      sharedTranscript,
      agendaItems: plannedAgendaItems,
      turnMeta,
      meetingArtifacts: baseArtifacts,
    };

    await updateShadowBoardRun(completed);
    await publishRunEvent(completed, "run_completed", {
      message: "Shadow board run completed.",
    });

    return completed;
  } catch (error) {
    const failed: ShadowBoardRun = {
      ...run,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown shadow board failure",
    };
    await updateShadowBoardRun(failed);
    await publishRunEvent(failed, "run_failed", {
      message: failed.error,
    });
    return failed;
  }
}

export async function startShadowBoardRun(input: RunInput): Promise<ShadowBoardRun> {
  const runRecord = buildInitialRunRecord(input);
  await createShadowBoardRun(runRecord);
  await publishRunEvent(runRecord, "run_started", {
    message: "Shadow board run started.",
  });
  return executeShadowBoardRun(runRecord, input);
}

export async function startShadowBoardRunAsync(input: RunInput): Promise<ShadowBoardRun> {
  const runRecord = buildInitialRunRecord(input);
  await createShadowBoardRun(runRecord);
  await publishRunEvent(runRecord, "run_started", {
    message: "Shadow board run started.",
  });

  scheduleShadowRun(async () => {
    await executeShadowBoardRun(runRecord, input);
  });

  return runRecord;
}
