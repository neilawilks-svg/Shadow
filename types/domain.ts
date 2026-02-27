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

export interface BoardMemberProfile extends PersonaProfile {
  role: "speaker" | "facilitator" | "observer";
  speakingSeat: number;
  sourceDocIds: string[];
  isSpeakingMember: boolean;
}

export interface BoardMemberAgentProfile {
  personaId: string;
  name: string;
  executiveSummary: string;
  coreMotivations: string[];
  decisionHeuristics: string[];
  supportTriggers: string[];
  challengeTriggers: string[];
  riskBias: string;
  discType: string;
  discArchetype: string;
  energizers: string[];
  drainers: string[];
  strengths: string[];
  blindSpots: string[];
  languagePatternsToUse: string[];
  languagePatternsToAvoid: string[];
  sourceDocIds: string[];
  sourcePaths: string[];
  generatedAt: string;
}

export interface BoardMemberProfilePack {
  generatedAt: string;
  profiles: BoardMemberAgentProfile[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  sourcePath: string;
  sourceType: "docx" | "pptx" | "pdf" | "md" | "txt" | "zip" | "other";
  meetingDate?: string;
  people: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  confidentiality: "local_only" | "internal";
  vaultPath: string;
  summary?: string;
  chunkIds: string[];
}

export interface VaultChunk {
  chunkId: string;
  docId: string;
  text: string;
  sourcePath: string;
  tags: string[];
  meetingDate?: string;
  people: string[];
  tokenEstimate: number;
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
  updatedAt?: string;
  linkedDocumentIds?: string[];
  morganResponses?: MorganResponse[];
  transcriptSegmentIds?: string[];
  notes?: string[];
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

export interface BoardTurnBid {
  personaId: string;
  urgency_1_to_10: number;
  shouldSpeak: boolean;
  proposedComment: string;
  reason: string;
  confidence: number;
  citations: string[];
}

export interface ShadowBoardControls {
  reasoningLevel: number;
  maxConversationTurns: number;
  randomness: number;
}

export interface MorganResponse {
  responseId: string;
  sessionId: string;
  text: string;
  question?: string;
  createdAt: string;
  audioPath?: string;
  autoplay?: boolean;
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
  shadowSessionId?: string;
  agenda: string;
  topics: string[];
  personaIds: string[];
  meetingId?: string;
  documentIds?: string[];
  controls?: ShadowBoardControls;
  meetingArtifacts?: string[];
  sharedTranscript?: string[];
  firstSpeakerPersonaId?: string;
  skippedPersonaIds?: string[];
  warnings?: string[];
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  outputs: PersonaDebateOutput[];
  turnBids?: BoardTurnBid[];
  recommendations: ShadowBoardRecommendation[];
  consensusSummary: string;
  dissentSummary: string;
  error?: string;
}

export type ShadowBoardRunEventType =
  | "run_started"
  | "turn_started"
  | "turn_committed"
  | "run_warning"
  | "run_completed"
  | "run_failed";

export interface ShadowBoardRunEvent {
  eventId: string;
  runId: string;
  shadowSessionId?: string;
  type: ShadowBoardRunEventType;
  createdAt: string;
  payload: {
    message?: string;
    run?: ShadowBoardRun;
    turnIndex?: number;
    topic?: string;
    speakerPersonaId?: string;
    speakerName?: string;
    transcriptLine?: string;
  };
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

export interface SessionTranscriptExport {
  sessionId: string;
  format: "md" | "json" | "srt";
  fileName: string;
  contentType: string;
  body: string;
  generatedAt: string;
}
