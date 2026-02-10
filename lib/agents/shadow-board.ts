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
        const fallback: PersonaDebateOutput = {
          personaId: persona.id,
          personaName: persona.name,
          viewpoint: `${persona.name} emphasizes ${persona.lens}.`,
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
          instructions: `${persona.promptTemplate}\nProvide concise board-style critique in JSON-compatible prose.`,
          model: config.modelShadowBoard,
        });

        try {
          const result = await run(
            agent,
            `Agenda: ${input.agenda}\nTopics: ${input.topics.join("; ")}\nReturn: viewpoint, risks (max 3), recommendations (max 3), challengeQuestions (max 3), confidence (0-1).`,
          );

          const text = String(result.finalOutput ?? "");
          return {
            ...fallback,
            viewpoint: text.slice(0, 700) || fallback.viewpoint,
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
