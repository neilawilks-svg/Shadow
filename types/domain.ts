export type PriorityLevel = "low" | "medium" | "high";

export type InterventionAction = "no_action" | "raise_hand";
export type InterventionPatternType =
  | "contradiction"
  | "missed_connection"
  | "risk"
  | "opportunity"
  | "long_horizon"
  | "none";

export interface PersonaProfile {
  id: string;
  name: string;
  lens: string;
  values: string[];
  riskPosture: "risk_averse" | "balanced" | "risk_tolerant";
  decisionStyle: string;
  challengeStyle: string;
  horizon: "short" | "medium" | "long";
  paceIncentive?: "accelerate" | "balanced" | "deliberate";
  consensusRole?: "driver" | "bridge" | "skeptic";
  promptTemplate: string;
  fixed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  sessionId: string;
  segmentId: string;
  text: string;
  startedAt: string;
  endedAt: string;
  speaker: string;
  confidence: number;
}

export interface MeetingSession {
  sessionId: string;
  title: string;
  status: "active" | "ended";
  consentAccepted: boolean;
  startedAt: string;
  endedAt?: string;
  lastHandRaisedAt?: string;
}

export interface InterventionCandidate {
  sessionId: string;
  action: InterventionAction;
  confidence: number;
  patternType: InterventionPatternType;
  evidence: string;
  suggestion: string;
  priority: PriorityLevel;
}

export interface HandRaiseEvent {
  eventId: string;
  sessionId: string;
  personaId: string;
  headline: string;
  details: string;
  createdAt: string;
  status: "queued" | "shown" | "dismissed";
  candidate: InterventionCandidate;
}

export interface PersonaInterviewTurn {
  question: string;
  answer: string;
  capturedAt: string;
}

export interface PersonaInterviewSession {
  interviewId: string;
  personaName: string;
  focusArea: string;
  turns: PersonaInterviewTurn[];
  status: "in_progress" | "ready_to_synthesize" | "completed";
  createdAt: string;
  updatedAt: string;
  draftProfile?: Partial<PersonaProfile>;
  nextQuestion?: string;
}

export interface ShadowBoardRecommendation {
  theme: string;
  recommendation: string;
  rationale: string;
  risks: string[];
  counterpoints: string[];
  confidence: number;
}

export interface PersonaDebateOutput {
  personaId: string;
  personaName: string;
  comment: string;
  comments: string[];
  viewpoint: string;
  thinkingSteps: string[];
  risks: string[];
  recommendations: string[];
  challengeQuestions: string[];
  confidence: number;
}

export interface ShadowBoardRun {
  runId: string;
  agenda: string;
  topics: string[];
  personaIds: string[];
  meetingArtifacts?: string[];
  sharedTranscript?: string[];
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  outputs: PersonaDebateOutput[];
  recommendations: ShadowBoardRecommendation[];
  consensusSummary: string;
  dissentSummary: string;
  error?: string;
}

export interface UsageMetric {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

export interface UsageSummary {
  totalEstimatedCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byFeature: Record<string, number>;
  recent: UsageMetric[];
}
