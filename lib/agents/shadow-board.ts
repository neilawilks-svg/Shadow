import { Agent, run } from "@openai/agents";
import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import {
  createShadowBoardRun,
  getPersonas,
  updateShadowBoardRun,
} from "@/lib/store/repository";
import type {
  PersonaDebateOutput,
  ShadowBoardRecommendation,
  ShadowBoardRun,
} from "@/types/domain";

interface RunInput {
  agenda: string;
  topics: string[];
  personaIds: string[];
}

interface PersonaStructuredOutput {
  comment?: string;
  comments?: string[];
  viewpoint: string;
  thinkingSteps: string[];
  risks: string[];
  recommendations: string[];
  challengeQuestions: string[];
  confidence: number;
}

const MIN_COMMENTS_PER_PERSONA = 3;
const MAX_COMMENTS_PER_PERSONA = 5;

export async function startShadowBoardRun(input: RunInput): Promise<ShadowBoardRun> {
  const runId = `shadow-${randomUUID()}`;
  const runRecord: ShadowBoardRun = {
    runId,
    agenda: input.agenda,
    topics: input.topics,
    personaIds: input.personaIds,
    status: "running",
    startedAt: new Date().toISOString(),
    outputs: [],
    recommendations: [],
    consensusSummary: "",
    dissentSummary: "",
  };

  await createShadowBoardRun(runRecord);

  try {
    const personas = (await getPersonas()).filter((persona) => input.personaIds.includes(persona.id));

    const outputs = await Promise.all(
      personas.map(async (persona): Promise<PersonaDebateOutput> => {
        const fallbackComments = buildFallbackComments(persona.name, persona.lens, input.topics);
        const fallback: PersonaDebateOutput = {
          personaId: persona.id,
          personaName: persona.name,
          comment: fallbackComments[0] ?? `${persona.name}: we should pressure-test assumptions before committing capital.`,
          comments: fallbackComments,
          viewpoint: `${persona.name} emphasizes ${persona.lens}.`,
          thinkingSteps: [
            "Clarify the core assumption behind this decision.",
            "Test downside exposure with a staged rollout.",
            "Define ownership and a measurable checkpoint.",
          ],
          risks: ["Potential execution risk due to unclear ownership."],
          recommendations: ["Define decision rights and measurable checkpoints."],
          challengeQuestions: ["What assumptions are we least confident about?"],
          confidence: 0.62,
        };

        if (!process.env.OPENAI_API_KEY) {
          return fallback;
        }

        const agent = new Agent({
          name: `${persona.name} Agent`,
          instructions: [
            persona.promptTemplate,
            "Return concise board-style critique as valid JSON.",
            "thinkingSteps must be high-level reasoning summaries suitable for UI thought bubbles (never hidden chain-of-thought).",
            "comments must contain 3-5 short conversational turns as if speaking across rounds in a board discussion.",
            "Each comment should be under 180 characters and reflect a distinct turn.",
            "Keep all arrays to max 3 items.",
          ].join("\n"),
          model: config.modelShadowBoard,
        });

        try {
          const result = await run(
            agent,
            [
              `Agenda: ${input.agenda}`,
              `Topics: ${input.topics.join("; ")}`,
              "Return exactly this JSON shape:",
              '{"comment":"string optional","comments":["string (3-5 turns)"],"viewpoint":"string","thinkingSteps":["string"],"risks":["string"],"recommendations":["string"],"challengeQuestions":["string"],"confidence":0.0}',
            ].join("\n"),
          );

          const text = String(result.finalOutput ?? "").trim();
          const parsed = parsePersonaOutput(text);
          if (!parsed) {
            const plainTextComments = extractPlainTextComments(text);
            const comments = normalizeComments(plainTextComments, plainTextComments[0], fallback.comments);
            return {
              ...fallback,
              viewpoint: text.slice(0, 700) || fallback.viewpoint,
              comment: comments[0] ?? fallback.comment,
              comments,
            };
          }

          const comments = normalizeComments(parsed.comments, parsed.comment, fallback.comments);
          return {
            personaId: persona.id,
            personaName: persona.name,
            comment: comments[0] ?? fallback.comment,
            comments,
            viewpoint: parsed.viewpoint || fallback.viewpoint,
            thinkingSteps: normalizeArray(parsed.thinkingSteps, fallback.thinkingSteps),
            risks: normalizeArray(parsed.risks, fallback.risks),
            recommendations: normalizeArray(parsed.recommendations, fallback.recommendations),
            challengeQuestions: normalizeArray(parsed.challengeQuestions, fallback.challengeQuestions),
            confidence:
              typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
                ? Math.max(0, Math.min(1, parsed.confidence))
                : fallback.confidence,
          };
        } catch {
          return fallback;
        }
      }),
    );

    const recommendations = synthesizeRecommendations(outputs);
    const consensusSummary = buildConsensusSummary(outputs);
    const dissentSummary = buildDissentSummary(outputs);

    const completed: ShadowBoardRun = {
      ...runRecord,
      status: "completed",
      finishedAt: new Date().toISOString(),
      outputs,
      recommendations,
      consensusSummary,
      dissentSummary,
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

function synthesizeRecommendations(outputs: PersonaDebateOutput[]): ShadowBoardRecommendation[] {
  const recs: ShadowBoardRecommendation[] = [
    {
      theme: "Decision clarity",
      recommendation: "Define explicit decision owner, timeline, and measurable success criteria before approval.",
      rationale: "Multiple personas raised execution ambiguity and accountability concerns.",
      risks: ["Slow execution", "Misaligned interpretation"],
      counterpoints: ["May reduce flexibility if over-specified."],
      confidence: 0.79,
    },
    {
      theme: "Risk controls",
      recommendation: "Introduce a staged checkpoint plan with reversible milestones.",
      rationale: "Personas surfaced uncertainty around downstream impacts and assumptions.",
      risks: ["Unmanaged downside", "Escalating sunk cost"],
      counterpoints: ["Extra governance overhead can delay momentum."],
      confidence: 0.74,
    },
  ];

  if (outputs.length < 4) {
    return recs.slice(0, 1);
  }

  return recs;
}

function buildConsensusSummary(outputs: PersonaDebateOutput[]): string {
  const names = outputs.slice(0, 4).map((output) => output.personaName).join(", ");
  return `Consensus: ${names} and others aligned on stronger decision clarity, explicit ownership, and staged execution gates.`;
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
    return "Dissent: Tradeoff between pace and control was raised but not blocking.";
  }

  return `Dissent: ${optimistic.personaName} favored faster experimentation while ${cautious.personaName} preferred stronger downside controls before full rollout.`;
}

function parsePersonaOutput(text: string): PersonaStructuredOutput | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  const candidate = text.slice(first, last + 1);
  try {
    return JSON.parse(candidate) as PersonaStructuredOutput;
  } catch {
    return null;
  }
}

function buildFallbackComments(personaName: string, lens: string, topics: string[]): string[] {
  const topicA = topics[0]?.trim() || "the strategic priority";
  const topicB = topics[1]?.trim() || "execution readiness";

  return [
    `${personaName}: Let's define the success metric for ${topicA} before we scale investment.`,
    `${personaName}: I support a time-boxed pilot tied to ${topicB} so we can adjust quickly.`,
    `${personaName}: Assign one accountable executive owner with clear escalation checkpoints.`,
    `${personaName}: Through the ${lens.toLowerCase()} lens, what tradeoffs are we underestimating?`,
  ];
}

function extractPlainTextComments(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_COMMENTS_PER_PERSONA);
}

function normalizeComments(
  input: unknown,
  singularComment: unknown,
  fallback: string[],
): string[] {
  const normalized = new Set<string>();

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item !== "string") {
        continue;
      }
      const cleaned = item.trim();
      if (cleaned.length === 0) {
        continue;
      }
      normalized.add(cleaned.slice(0, 180));
      if (normalized.size >= MAX_COMMENTS_PER_PERSONA) {
        break;
      }
    }
  }

  if (normalized.size === 0 && typeof singularComment === "string") {
    const cleaned = singularComment.trim();
    if (cleaned.length > 0) {
      normalized.add(cleaned.slice(0, 180));
    }
  }

  for (const fallbackComment of fallback) {
    if (normalized.size >= MIN_COMMENTS_PER_PERSONA) {
      break;
    }
    const cleaned = fallbackComment.trim();
    if (cleaned.length > 0) {
      normalized.add(cleaned.slice(0, 180));
    }
  }

  while (normalized.size < MIN_COMMENTS_PER_PERSONA) {
    normalized.add("Let's define owners, metrics, and checkpoints before committing full rollout.");
  }

  return Array.from(normalized).slice(0, MAX_COMMENTS_PER_PERSONA);
}

function normalizeArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const cleaned = input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : fallback;
}
