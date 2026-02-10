import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import { runJsonModel } from "@/lib/openai/json-response";
import {
  createShadowBoardRun,
  getPersonas,
  updateShadowBoardRun,
} from "@/lib/store/repository";
import type {
  PersonaDebateOutput,
  PersonaProfile,
  ShadowBoardRecommendation,
  ShadowBoardRun,
} from "@/types/domain";

type PaceIncentive = "accelerate" | "balanced" | "deliberate";
type ConsensusRole = "driver" | "bridge" | "skeptic";

interface RunInput {
  agenda: string;
  topics: string[];
  personaIds: string[];
  meetingArtifacts?: string[];
  transcriptSeed?: string[];
}

interface PersonaTurn {
  personaId: string;
  personaName: string;
  comment: string;
  thinkingStep: string;
  risk: string;
  recommendation: string;
  challengeQuestion: string;
  confidence: number;
  round: number;
}

interface PersonaRuntime {
  persona: PersonaProfile;
  paceIncentive: PaceIncentive;
  consensusRole: ConsensusRole;
  targetTurns: number;
  turns: PersonaTurn[];
}

interface RoundTurnRaw {
  personaId?: string;
  speakerId?: string;
  comment?: string;
  text?: string;
  thinkingStep?: string;
  risk?: string;
  recommendation?: string;
  challengeQuestion?: string;
  confidence?: number;
}

interface RoundPlan {
  turns: RoundTurnRaw[];
  moderatorNote?: string;
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

const MIN_COMMENTS_PER_PERSONA = 3;
const MAX_COMMENTS_PER_PERSONA = 5;
const MAX_ROUNDS = 5;
const MAX_TRANSCRIPT_LINES = 160;
const MAX_ARTIFACT_LINES = 16;

export async function startShadowBoardRun(input: RunInput): Promise<ShadowBoardRun> {
  const runId = `shadow-${randomUUID()}`;
  const meetingArtifacts = normalizeStringArray(input.meetingArtifacts, MAX_ARTIFACT_LINES);
  const transcriptSeed = normalizeStringArray(input.transcriptSeed, 48);

  const runRecord: ShadowBoardRun = {
    runId,
    agenda: input.agenda,
    topics: input.topics,
    personaIds: input.personaIds,
    meetingArtifacts,
    sharedTranscript: transcriptSeed,
    status: "running",
    startedAt: new Date().toISOString(),
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
  };

  await createShadowBoardRun(runRecord);

  try {
    const selectedPersonas = (await getPersonas()).filter((persona) => input.personaIds.includes(persona.id));
    const runtimeSeed = hashStringToSeed(`${runId}|${input.agenda}|${input.topics.join("|")}`);
    const random = createRng(runtimeSeed);

    const runtimes: PersonaRuntime[] = selectedPersonas.map((persona) => {
      const paceIncentive = resolvePaceIncentive(persona);
      return {
        persona,
        paceIncentive,
        consensusRole: resolveConsensusRole(persona),
        targetTurns: pickTargetTurnCount(paceIncentive, random),
        turns: [],
      };
    });

    const sharedTranscript: string[] = transcriptSeed.length > 0
      ? [...transcriptSeed]
      : [`Board Chair: Agenda is ${input.agenda}`];

    if (meetingArtifacts.length > 0) {
      sharedTranscript.push(`Board Chair: Meeting artifacts have been reviewed (${meetingArtifacts.length} items).`);
    }

    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const participants = runtimes.filter((runtime) => {
        if (round <= MIN_COMMENTS_PER_PERSONA) {
          return runtime.turns.length < MIN_COMMENTS_PER_PERSONA;
        }
        return runtime.turns.length < runtime.targetTurns;
      });

      if (participants.length === 0) {
        break;
      }

      const roundTurns = await generateRoundTurns({
        round,
        agenda: input.agenda,
        topics: input.topics,
        meetingArtifacts,
        sharedTranscript,
        participants,
        random,
      });

      const runtimeById = new Map(runtimes.map((runtime) => [runtime.persona.id, runtime]));
      for (const turn of roundTurns) {
        const runtime = runtimeById.get(turn.personaId);
        if (!runtime) {
          continue;
        }

        if (runtime.turns.length >= runtime.targetTurns) {
          continue;
        }

        runtime.turns.push(turn);
        sharedTranscript.push(`[Round ${round}] ${turn.personaName}: ${turn.comment}`);
      }

      trimTranscript(sharedTranscript, MAX_TRANSCRIPT_LINES);

      if (round >= 2 && calculateRepetitionRatio(sharedTranscript) > 0.28) {
        sharedTranscript.push(
          "Moderator: We are starting to repeat points. Shift to decision ownership, timeline, and measurable checkpoints.",
        );
      }
    }

    enforceCommentBounds(runtimes, input.topics, random);

    const outputs = runtimes.map((runtime) => buildPersonaOutput(runtime, input.topics));

    const fallbackRecommendations = synthesizeRecommendations(outputs);
    const fallbackConsensus = buildConsensusSummary(outputs);
    const fallbackDissent = buildDissentSummary(outputs);

    const consensus = await synthesizeConsensus({
      agenda: input.agenda,
      topics: input.topics,
      meetingArtifacts,
      sharedTranscript,
      runtimes,
      fallbackRecommendations,
      fallbackConsensus,
      fallbackDissent,
    });

    const completed: ShadowBoardRun = {
      ...runRecord,
      status: "completed",
      finishedAt: new Date().toISOString(),
      outputs,
      recommendations: consensus.recommendations,
      consensusSummary: consensus.consensusSummary,
      dissentSummary: consensus.dissentSummary,
      sharedTranscript,
      meetingArtifacts,
    };

    await updateShadowBoardRun(completed);
    return completed;
  } catch (error) {
    const failed: ShadowBoardRun = {
      ...runRecord,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown shadow board failure",
    };
    await updateShadowBoardRun(failed);
    return failed;
  }
}

async function generateRoundTurns(params: {
  round: number;
  agenda: string;
  topics: string[];
  meetingArtifacts: string[];
  sharedTranscript: string[];
  participants: PersonaRuntime[];
  random: () => number;
}): Promise<PersonaTurn[]> {
  const fallbackTurns = buildFallbackRoundTurns(
    params.round,
    params.topics,
    params.sharedTranscript,
    params.participants,
    params.random,
  );

  const roundGoal =
    params.round === 1
      ? "Frame core assumptions and initial concerns."
      : params.round === 2
        ? "Challenge tradeoffs and respond to each other directly."
        : "Converge toward an actionable board recommendation with owners, timeline, and guardrails.";

  const modelRound = await runJsonModel<RoundPlan>(
    {
      model: config.modelShadowBoard,
      feature: "shadow_board_round",
      systemPrompt: [
        "You are moderating a virtual board simulation.",
        "Every participant must speak exactly once in this round.",
        "Each comment must react to the shared transcript and avoid repeating prior phrasing.",
        "Accelerate personas push toward closure; deliberate personas pressure-test risk and controls; balanced personas bridge toward compromise.",
        "Return compact JSON only.",
      ].join("\n"),
      userPrompt: [
        `Round: ${params.round}`,
        `Round goal: ${roundGoal}`,
        `Agenda: ${params.agenda}`,
        `Topics: ${params.topics.join("; ")}`,
        "Meeting artifacts:",
        params.meetingArtifacts.length > 0 ? params.meetingArtifacts.map((item) => `- ${item}`).join("\n") : "- none provided",
        "Participant roster (id, name, lens, pace incentive, consensus role, current turns, target turns):",
        JSON.stringify(
          params.participants.map((participant) => ({
            id: participant.persona.id,
            name: participant.persona.name,
            lens: participant.persona.lens,
            paceIncentive: participant.paceIncentive,
            consensusRole: participant.consensusRole,
            currentTurns: participant.turns.length,
            targetTurns: participant.targetTurns,
          })),
          null,
          2,
        ),
        "Shared transcript to date:",
        params.sharedTranscript.slice(-120).map((line) => `- ${line}`).join("\n"),
        "Required JSON schema:",
        '{"turns":[{"personaId":"string","comment":"string","thinkingStep":"string","risk":"string","recommendation":"string","challengeQuestion":"string","confidence":0.0}],"moderatorNote":"optional string"}',
        "Rules:",
        "- Provide exactly one turn for each participant personaId above.",
        "- Keep comment text under 320 characters.",
        "- Mix concise and slightly verbose comments (2-3 short sentences when needed).",
        "- Include occasional direct back-and-forth references to prior speakers.",
        "- Do not repeat the same recommendation wording from transcript lines.",
      ].join("\n\n"),
    },
    { turns: fallbackTurns },
  );

  return normalizeRoundTurns(
    modelRound?.turns,
    params.round,
    params.topics,
    params.sharedTranscript,
    params.participants,
    fallbackTurns,
    params.random,
  );
}

function normalizeRoundTurns(
  rawTurns: RoundTurnRaw[] | undefined,
  round: number,
  topics: string[],
  sharedTranscript: string[],
  participants: PersonaRuntime[],
  fallbackTurns: PersonaTurn[],
  random: () => number,
): PersonaTurn[] {
  const participantById = new Map(participants.map((participant) => [participant.persona.id, participant]));
  const seen = new Set<string>();
  const normalized: PersonaTurn[] = [];

  if (Array.isArray(rawTurns)) {
    for (const candidate of rawTurns) {
      const personaId =
        (typeof candidate?.personaId === "string" && candidate.personaId) ||
        (typeof candidate?.speakerId === "string" && candidate.speakerId) ||
        "";

      if (!personaId || seen.has(personaId)) {
        continue;
      }

      const participant = participantById.get(personaId);
      if (!participant) {
        continue;
      }

      const originalComment =
        (typeof candidate?.comment === "string" && candidate.comment.trim()) ||
        (typeof candidate?.text === "string" && candidate.text.trim()) ||
        "";

      let comment = normalizeCommentText(
        originalComment,
        participant.persona.name,
        topics,
        participant.paceIncentive,
        round,
        random,
      );

      if (isLikelyDuplicateComment(comment, sharedTranscript)) {
        comment = buildProgressPivotComment(participant, round, topics, random);
      }

      normalized.push({
        personaId,
        personaName: participant.persona.name,
        comment,
        thinkingStep: normalizeShortText(
          typeof candidate?.thinkingStep === "string" ? candidate.thinkingStep : "",
          fallbackThinkingStep(participant, round, topics),
          180,
        ),
        risk: normalizeShortText(
          typeof candidate?.risk === "string" ? candidate.risk : "",
          fallbackRisk(participant, topics),
          180,
        ),
        recommendation: normalizeShortText(
          typeof candidate?.recommendation === "string" ? candidate.recommendation : "",
          fallbackRecommendation(participant, topics),
          180,
        ),
        challengeQuestion: normalizeShortText(
          typeof candidate?.challengeQuestion === "string" ? candidate.challengeQuestion : "",
          fallbackChallengeQuestion(participant, topics),
          180,
        ),
        confidence: clampConfidence(candidate?.confidence, 0.72),
        round,
      });
      seen.add(personaId);
    }
  }

  for (const fallbackTurn of fallbackTurns) {
    if (seen.has(fallbackTurn.personaId)) {
      continue;
    }
    normalized.push(fallbackTurn);
    seen.add(fallbackTurn.personaId);
  }

  const prioritized = shuffle(
    [...normalized],
    createRng(hashStringToSeed(`round-${round}-${normalized.map((item) => item.personaId).join("|")}`)),
  );
  return prioritized;
}

function buildFallbackRoundTurns(
  round: number,
  topics: string[],
  sharedTranscript: string[],
  participants: PersonaRuntime[],
  random: () => number,
): PersonaTurn[] {
  const order = shuffle([...participants], random);
  const turns: PersonaTurn[] = [];

  for (let index = 0; index < order.length; index += 1) {
    const participant = order[index];
    const previousSpeaker = index > 0 ? order[index - 1]?.persona.name : null;
    const topic = topics[(round + index - 1 + topics.length) % Math.max(1, topics.length)] || "the proposal";

    let comment = buildProgressPivotComment(participant, round, topics, random);
    if (previousSpeaker && random() < 0.34) {
      comment = `${participant.persona.name}: I hear ${previousSpeaker}'s point, and through my lens on ${topic}, we should clarify owners and guardrails before final approval.`;
    }

    if (isLikelyDuplicateComment(comment, sharedTranscript)) {
      comment = `${participant.persona.name}: To keep us moving, let's lock a measurable checkpoint for ${topic} and review in one governance cycle.`;
    }

    turns.push({
      personaId: participant.persona.id,
      personaName: participant.persona.name,
      comment: clampText(comment, 320),
      thinkingStep: fallbackThinkingStep(participant, round, topics),
      risk: fallbackRisk(participant, topics),
      recommendation: fallbackRecommendation(participant, topics),
      challengeQuestion: fallbackChallengeQuestion(participant, topics),
      confidence: clampConfidence(0.64 + random() * 0.2, 0.72),
      round,
    });
  }

  return turns;
}

function enforceCommentBounds(runtimes: PersonaRuntime[], topics: string[], random: () => number): void {
  for (const runtime of runtimes) {
    while (runtime.turns.length < MIN_COMMENTS_PER_PERSONA) {
      runtime.turns.push({
        personaId: runtime.persona.id,
        personaName: runtime.persona.name,
        comment: buildProgressPivotComment(runtime, runtime.turns.length + 1, topics, random),
        thinkingStep: fallbackThinkingStep(runtime, runtime.turns.length + 1, topics),
        risk: fallbackRisk(runtime, topics),
        recommendation: fallbackRecommendation(runtime, topics),
        challengeQuestion: fallbackChallengeQuestion(runtime, topics),
        confidence: 0.66,
        round: runtime.turns.length + 1,
      });
    }

    if (runtime.turns.length > MAX_COMMENTS_PER_PERSONA) {
      runtime.turns = [runtime.turns[0], ...runtime.turns.slice(-(MAX_COMMENTS_PER_PERSONA - 1))];
    }
  }
}

function buildPersonaOutput(runtime: PersonaRuntime, topics: string[]): PersonaDebateOutput {
  const turns = runtime.turns;
  const comments = dedupeStrings(turns.map((turn) => turn.comment)).slice(0, MAX_COMMENTS_PER_PERSONA);
  const confidence = average(turns.map((turn) => turn.confidence), 0.68);

  return {
    personaId: runtime.persona.id,
    personaName: runtime.persona.name,
    comment:
      comments[0] ??
      `${runtime.persona.name}: We should align on decision owner, timeline, and guardrails before final approval.`,
    comments,
    viewpoint: buildViewpoint(runtime),
    thinkingSteps: dedupeStrings([
      ...turns.map((turn) => turn.thinkingStep),
      fallbackThinkingStep(runtime, 3, topics),
    ]).slice(0, 3),
    risks: dedupeStrings([...turns.map((turn) => turn.risk), fallbackRisk(runtime, topics)]).slice(0, 3),
    recommendations: dedupeStrings([
      ...turns.map((turn) => turn.recommendation),
      fallbackRecommendation(runtime, topics),
    ]).slice(0, 3),
    challengeQuestions: dedupeStrings([
      ...turns.map((turn) => turn.challengeQuestion),
      fallbackChallengeQuestion(runtime, topics),
    ]).slice(0, 3),
    confidence,
  };
}

async function synthesizeConsensus(params: {
  agenda: string;
  topics: string[];
  meetingArtifacts: string[];
  sharedTranscript: string[];
  runtimes: PersonaRuntime[];
  fallbackRecommendations: ShadowBoardRecommendation[];
  fallbackConsensus: string;
  fallbackDissent: string;
}): Promise<{
  consensusSummary: string;
  dissentSummary: string;
  recommendations: ShadowBoardRecommendation[];
}> {
  const fallback = {
    consensusSummary: params.fallbackConsensus,
    dissentSummary: params.fallbackDissent,
    recommendations: params.fallbackRecommendations,
  };

  const modelSynthesis = await runJsonModel<ConsensusSynthesis>(
    {
      model: config.modelShadowBoard,
      feature: "shadow_board_consensus",
      systemPrompt: [
        "You are the board meeting synthesis assistant.",
        "Summarize consensus and dissent from the transcript.",
        "Prevent loops by driving to one clear decision path with guardrails.",
        "Return JSON only.",
      ].join("\n"),
      userPrompt: [
        `Agenda: ${params.agenda}`,
        `Topics: ${params.topics.join("; ")}`,
        "Meeting artifacts:",
        params.meetingArtifacts.length > 0
          ? params.meetingArtifacts.map((item) => `- ${item}`).join("\n")
          : "- none provided",
        "Persona incentives:",
        params.runtimes
          .map(
            (runtime) =>
              `- ${runtime.persona.name} (${runtime.persona.id}) pace=${runtime.paceIncentive} role=${runtime.consensusRole}`,
          )
          .join("\n"),
        "Shared transcript:",
        params.sharedTranscript.slice(-140).map((line) => `- ${line}`).join("\n"),
        "Required JSON schema:",
        '{"consensusSummary":"string","dissentSummary":"string","recommendations":[{"theme":"string","recommendation":"string","rationale":"string","risks":["string"],"counterpoints":["string"],"confidence":0.0}] }',
        "Rules:",
        "- Consensus summary must include a concrete closure action (owner/timeline/checkpoint).",
        "- Dissent summary must capture unresolved tension without reopening the whole debate.",
        "- Recommendation list should contain 2-3 items with confidence scores.",
      ].join("\n\n"),
    },
    fallback,
  );

  const recommendations = normalizeRecommendations(
    modelSynthesis?.recommendations,
    params.fallbackRecommendations,
  );

  return {
    consensusSummary:
      normalizeParagraph(modelSynthesis?.consensusSummary) ||
      buildConsensusSummaryFromRecommendations(recommendations, params.fallbackConsensus),
    dissentSummary: normalizeParagraph(modelSynthesis?.dissentSummary) || params.fallbackDissent,
    recommendations,
  };
}

function normalizeRecommendations(
  input: ConsensusSynthesis["recommendations"],
  fallback: ShadowBoardRecommendation[],
): ShadowBoardRecommendation[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized: ShadowBoardRecommendation[] = [];
  for (const candidate of input) {
    const theme = normalizeShortText(candidate?.theme ?? "", "Decision quality", 90);
    const recommendation = normalizeShortText(
      candidate?.recommendation ?? "",
      "Define owner, timeline, and measurable checkpoint before final approval.",
      220,
    );
    const rationale = normalizeShortText(
      candidate?.rationale ?? "",
      "Board members balanced innovation velocity with downside controls.",
      240,
    );
    const risks = normalizeStringArray(candidate?.risks, 3);
    const counterpoints = normalizeStringArray(candidate?.counterpoints, 3);

    normalized.push({
      theme,
      recommendation,
      rationale,
      risks: risks.length > 0 ? risks : ["Execution risk if ownership is unclear."],
      counterpoints: counterpoints.length > 0 ? counterpoints : ["Too many controls can reduce speed-to-learning."],
      confidence: clampConfidence(candidate?.confidence, 0.74),
    });
  }

  return normalized.length > 0 ? normalized.slice(0, 3) : fallback;
}

function synthesizeRecommendations(outputs: PersonaDebateOutput[]): ShadowBoardRecommendation[] {
  const hasCautious = outputs.some((output) =>
    output.personaName.toLowerCase().includes("financial") || output.personaName.toLowerCase().includes("retirement"),
  );

  const hasAccelerator = outputs.some((output) =>
    output.personaName.toLowerCase().includes("innovation") || output.personaName.toLowerCase().includes("operator"),
  );

  const recs: ShadowBoardRecommendation[] = [
    {
      theme: "Decision closure",
      recommendation: "Approve a time-boxed pilot with one executive owner, 30-day checkpoint, and explicit success metrics.",
      rationale: "The simulation converged once ownership and checkpoint cadence became explicit.",
      risks: ["Ambiguous accountability", "Scope creep before evidence is available"],
      counterpoints: ["A strict checkpoint cadence can reduce flexibility for fast opportunities."],
      confidence: 0.79,
    },
    {
      theme: "Control and speed balance",
      recommendation: "Pair acceleration goals with pre-defined guardrails: risk thresholds, rollback triggers, and disclosure playbooks.",
      rationale: "Deliberate personas surfaced downside controls while accelerator personas pushed for momentum.",
      risks: ["Delayed adoption", "Over-indexing on speed without governance"],
      counterpoints: ["Over-governance can suppress experimentation value."],
      confidence: 0.75,
    },
  ];

  if (!hasCautious || !hasAccelerator) {
    return recs.slice(0, 1);
  }

  return recs;
}

function buildConsensusSummary(outputs: PersonaDebateOutput[]): string {
  const names = outputs.slice(0, 4).map((output) => output.personaName).join(", ");
  return `Consensus: ${names} and peers aligned on a time-boxed decision path with explicit owner, timeline, and measurable checkpoint.`;
}

function buildConsensusSummaryFromRecommendations(
  recommendations: ShadowBoardRecommendation[],
  fallback: string,
): string {
  const first = recommendations[0]?.recommendation;
  if (!first) {
    return fallback;
  }
  return `Consensus: ${first}`;
}

function buildDissentSummary(outputs: PersonaDebateOutput[]): string {
  if (outputs.length === 0) {
    return "Dissent: No dissent captured.";
  }

  const cautious = outputs.find((output) =>
    output.personaName.toLowerCase().includes("financial") || output.personaName.toLowerCase().includes("retirement"),
  );

  const optimistic = outputs.find((output) => output.personaName.toLowerCase().includes("innovation"));

  if (!cautious || !optimistic) {
    return "Dissent: The board debated speed versus control but remained aligned on phased execution.";
  }

  return `Dissent: ${optimistic.personaName} pushed for faster experimentation while ${cautious.personaName} insisted on tighter downside controls before scaling.`;
}

function resolvePaceIncentive(persona: PersonaProfile): PaceIncentive {
  if (persona.paceIncentive) {
    return persona.paceIncentive;
  }

  if (persona.riskPosture === "risk_tolerant") {
    return "accelerate";
  }

  if (persona.riskPosture === "risk_averse" || persona.horizon === "long") {
    return "deliberate";
  }

  return "balanced";
}

function resolveConsensusRole(persona: PersonaProfile): ConsensusRole {
  if (persona.consensusRole) {
    return persona.consensusRole;
  }

  if (persona.riskPosture === "risk_tolerant") {
    return "driver";
  }

  if (persona.riskPosture === "risk_averse") {
    return "skeptic";
  }

  return "bridge";
}

function pickTargetTurnCount(paceIncentive: PaceIncentive, random: () => number): number {
  if (paceIncentive === "accelerate") {
    return randomInt(random, 4, 5);
  }

  if (paceIncentive === "deliberate") {
    return randomInt(random, 3, 4);
  }

  return randomInt(random, 3, 5);
}

function buildViewpoint(runtime: PersonaRuntime): string {
  const paceLine =
    runtime.paceIncentive === "accelerate"
      ? "leans toward closing decisions quickly"
      : runtime.paceIncentive === "deliberate"
        ? "slows decisions to pressure-test risk"
        : "balances momentum with practical safeguards";

  return `${runtime.persona.name} brings a ${runtime.persona.lens.toLowerCase()} lens and ${paceLine}.`;
}

function fallbackThinkingStep(runtime: PersonaRuntime, round: number, topics: string[]): string {
  const topic = topics[(round - 1 + topics.length) % Math.max(1, topics.length)] || "the proposal";
  if (runtime.paceIncentive === "accelerate") {
    return `Translate ${topic} into a time-boxed experiment with one accountable owner.`;
  }
  if (runtime.paceIncentive === "deliberate") {
    return `Stress-test downside scenarios for ${topic} before irreversible commitments.`;
  }
  return `Bridge competing views on ${topic} into one measurable checkpoint.`;
}

function fallbackRisk(runtime: PersonaRuntime, topics: string[]): string {
  const topic = topics[0] || "the strategy";
  if (runtime.paceIncentive === "deliberate") {
    return `Control gaps around ${topic} could create downstream governance exposure.`;
  }
  return `Unclear ownership around ${topic} can stall execution quality.`;
}

function fallbackRecommendation(runtime: PersonaRuntime, topics: string[]): string {
  const topic = topics[0] || "the strategy";
  if (runtime.paceIncentive === "accelerate") {
    return `Launch a 30-day pilot for ${topic} with explicit success and rollback criteria.`;
  }
  if (runtime.paceIncentive === "deliberate") {
    return `Gate ${topic} behind risk thresholds, disclosure readiness, and audit checkpoints.`;
  }
  return `Assign owner and timeline for ${topic}, then review evidence at a formal checkpoint.`;
}

function fallbackChallengeQuestion(runtime: PersonaRuntime, topics: string[]): string {
  const topic = topics[1] || topics[0] || "this proposal";
  if (runtime.paceIncentive === "deliberate") {
    return `What failure mode in ${topic} would force us to pause rollout immediately?`;
  }
  if (runtime.paceIncentive === "accelerate") {
    return `What is the fastest high-confidence signal that ${topic} is creating real value?`;
  }
  return `What single checkpoint would align speed and risk discipline for ${topic}?`;
}

function buildProgressPivotComment(
  runtime: PersonaRuntime,
  round: number,
  topics: string[],
  random: () => number,
): string {
  const topic = topics[(round - 1 + topics.length) % Math.max(1, topics.length)] || "the proposal";
  const opener = `${runtime.persona.name}:`;

  if (runtime.paceIncentive === "accelerate") {
    const sentenceA = `We're close to looping, so let's close on ${topic} with a time-boxed decision now.`;
    const sentenceB =
      random() < 0.5
        ? "Name one accountable owner and a 30-day metric checkpoint so we can move."
        : "Set a pilot boundary, commit date, and rollback trigger to keep momentum disciplined.";
    return clampText(`${opener} ${sentenceA} ${sentenceB}`, 320);
  }

  if (runtime.paceIncentive === "deliberate") {
    const sentenceA = `Before final approval on ${topic}, we need one explicit downside scenario and control threshold.`;
    const sentenceB =
      random() < 0.5
        ? "That slows us briefly, but it prevents avoidable governance and disclosure failures."
        : "If we can't articulate the stop condition, we aren't ready to scale this decision.";
    return clampText(`${opener} ${sentenceA} ${sentenceB}`, 320);
  }

  const sentenceA = `Let's bridge both camps on ${topic}: commit to action, but lock in measurable guardrails.`;
  const sentenceB =
    random() < 0.5
      ? "We can resolve this with one owner, one timeline, and one review gate everyone accepts."
      : "This gives us pace without losing oversight, and ends the circular debate pattern.";
  return clampText(`${opener} ${sentenceA} ${sentenceB}`, 320);
}

function isLikelyDuplicateComment(comment: string, transcript: string[]): boolean {
  const target = canonicalize(comment);
  if (!target) {
    return false;
  }

  const recent = transcript.slice(-20);
  for (const line of recent) {
    const candidate = canonicalize(line);
    if (!candidate) {
      continue;
    }

    if (target === candidate) {
      return true;
    }

    if (jaccardSimilarity(target, candidate) > 0.76) {
      return true;
    }
  }

  return false;
}

function calculateRepetitionRatio(transcript: string[]): number {
  if (transcript.length <= 8) {
    return 0;
  }

  const recent = transcript.slice(-40).map((line) => canonicalize(line)).filter(Boolean);
  const seen = new Set<string>();
  let duplicates = 0;

  for (const line of recent) {
    if (seen.has(line)) {
      duplicates += 1;
    } else {
      seen.add(line);
    }
  }

  return duplicates / Math.max(1, recent.length);
}

function canonicalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .join(" ")
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / Math.max(1, union);
}

function normalizeCommentText(
  input: string,
  personaName: string,
  topics: string[],
  paceIncentive: PaceIncentive,
  round: number,
  random: () => number,
): string {
  const fallbackTopic = topics[(round - 1 + topics.length) % Math.max(1, topics.length)] || "the proposal";
  const fallback =
    paceIncentive === "accelerate"
      ? `${personaName}: Let's finalize ${fallbackTopic} with a clear owner and checkpoint.`
      : paceIncentive === "deliberate"
        ? `${personaName}: Before finalizing ${fallbackTopic}, we should pressure-test downside controls.`
        : `${personaName}: We can align ${fallbackTopic} by pairing momentum with guardrails.`;

  const normalized = normalizeShortText(input, fallback, 320);
  if (isLikelyDuplicateComment(normalized, [fallback])) {
    return clampText(`${fallback} This closes the loop and keeps accountability explicit.`, 320);
  }

  if (!normalized.startsWith(`${personaName}:`)) {
    return clampText(`${personaName}: ${normalized}`, 320);
  }

  if (random() < 0.08 && normalized.length < 120) {
    return clampText(`${normalized} Let's lock the next checkpoint now.`, 320);
  }

  return normalized;
}

function normalizeParagraph(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/\s+/g, " ").trim();
}

function normalizeShortText(input: unknown, fallback: string, maxLength: number): string {
  if (typeof input !== "string") {
    return clampText(fallback, maxLength);
  }

  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return clampText(fallback, maxLength);
  }

  return clampText(cleaned, maxLength);
}

function normalizeStringArray(input: unknown, maxItems: number): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") {
      continue;
    }
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      continue;
    }
    normalized.push(cleaned);
    if (normalized.length >= maxItems) {
      break;
    }
  }

  return dedupeStrings(normalized);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      continue;
    }

    const key = canonicalize(cleaned);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(cleaned);
  }

  return deduped;
}

function average(values: number[], fallback: number): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return fallback;
  }

  const sum = valid.reduce((total, value) => total + value, 0);
  return clampConfidence(sum / valid.length, fallback);
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Math.max(0, Math.min(1, fallback));
  }

  return Math.max(0, Math.min(1, value));
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function trimTranscript(lines: string[], maxLines: number): void {
  if (lines.length <= maxLines) {
    return;
  }
  lines.splice(0, lines.length - maxLines);
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 1;
  }

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function hashStringToSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0 || 1;
}

function randomInt(random: () => number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return Math.floor(random() * (max - min + 1)) + min;
}

function shuffle<T>(input: T[], random: () => number): T[] {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }

  return items;
}
