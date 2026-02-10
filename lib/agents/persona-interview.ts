import { config } from "@/lib/config";
import { runJsonModel } from "@/lib/openai/json-response";
import {
  createInterviewSession,
  getInterviewSession,
  updateInterviewSession,
} from "@/lib/store/repository";
import type { PersonaInterviewSession, PersonaProfile } from "@/types/domain";

const QUESTION_FLOW = [
  "What outcomes matter most to you when evaluating a strategic proposal?",
  "How do you balance short-term pressure with long-term value?",
  "What kinds of risks worry you most in board decisions?",
  "Describe your preferred decision process when information is incomplete.",
  "How do you challenge ideas constructively when you disagree?",
  "What signals tell you an initiative is likely to succeed or fail?",
];

export async function startPersonaInterview(personaName: string, focusArea: string): Promise<PersonaInterviewSession> {
  const interview = await createInterviewSession(personaName, focusArea);
  interview.nextQuestion = QUESTION_FLOW[0];
  await updateInterviewSession(interview);
  return interview;
}

export async function processPersonaInterviewTurn(interviewId: string, answer: string): Promise<PersonaInterviewSession> {
  const interview = await getInterviewSession(interviewId);
  if (!interview) {
    throw new Error("Interview not found.");
  }

  const question = interview.nextQuestion ?? QUESTION_FLOW[interview.turns.length] ?? QUESTION_FLOW.at(-1) ?? "";
  interview.turns.push({
    question,
    answer,
    capturedAt: new Date().toISOString(),
  });

  if (interview.turns.length >= QUESTION_FLOW.length) {
    interview.status = "ready_to_synthesize";
    interview.nextQuestion = undefined;
  } else {
    interview.nextQuestion = QUESTION_FLOW[interview.turns.length];
  }

  interview.draftProfile = await synthesizeDraftProfile(interview);
  await updateInterviewSession(interview);
  return interview;
}

async function synthesizeDraftProfile(interview: PersonaInterviewSession): Promise<Partial<PersonaProfile>> {
  const transcript = interview.turns.map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`).join("\n\n");

  const fallback: Partial<PersonaProfile> = {
    name: interview.personaName,
    lens: interview.focusArea || "Board strategic lens",
    values: ["clarity", "accountability", "long-term value"],
    riskPosture: "balanced",
    decisionStyle: "Structured and evidence-based",
    challengeStyle: "Constructive challenger",
    horizon: "long",
    promptTemplate:
      "Act as a board member profile focused on strategic clarity, practical tradeoffs, and long-term organizational value.",
  };

  return runJsonModel<Partial<PersonaProfile>>(
    {
      model: config.modelPersonaSynthesis,
      feature: "persona_synthesis",
      systemPrompt:
        "You synthesize board-member persona profiles from interviews. Output values and decision style only. Do not imitate identity, biography, or voice.",
      userPrompt: `Interview transcript:\n${transcript}`,
    },
    fallback,
  );
}
