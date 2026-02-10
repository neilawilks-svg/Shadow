import { randomUUID } from "node:crypto";

import type {
  HandRaiseEvent,
  MeetingSession,
  PersonaInterviewSession,
  PersonaProfile,
  ShadowBoardRun,
  TranscriptSegment,
  UsageMetric,
  UsageSummary,
} from "@/types/domain";

import { config } from "@/lib/config";
import { FIXED_PERSONAS } from "@/lib/store/default-personas";
import { readJsonFile, writeJsonFile } from "@/lib/store/file-store";

const PERSONAS_FILE = "personas.json";
const MEETING_SESSIONS_FILE = "meeting-sessions.json";
const TRANSCRIPTS_FILE = "transcript-segments.json";
const HAND_RAISE_FILE = "hand-raise-events.json";
const INTERVIEWS_FILE = "persona-interviews.json";
const SHADOW_BOARD_FILE = "shadow-board-runs.json";
const USAGE_FILE = "usage-metrics.json";

declare global {
  var __runtimeTranscripts: Map<string, TranscriptSegment[]> | undefined;
}

const runtimeTranscripts = globalThis.__runtimeTranscripts ?? new Map<string, TranscriptSegment[]>();
globalThis.__runtimeTranscripts = runtimeTranscripts;

export async function getPersonas(): Promise<PersonaProfile[]> {
  const existing = await readJsonFile<PersonaProfile[]>(PERSONAS_FILE, []);
  const dynamic = existing.filter((persona) => !persona.fixed);
  const merged = [...FIXED_PERSONAS, ...dynamic];
  await writeJsonFile(PERSONAS_FILE, merged);
  return merged;
}

export async function savePersona(persona: Omit<PersonaProfile, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<PersonaProfile> {
  const personas = await getPersonas();
  const now = new Date().toISOString();
  const record: PersonaProfile = {
    ...persona,
    id: persona.id ?? `persona-${randomUUID()}`,
    fixed: false,
    createdAt: now,
    updatedAt: now,
  };

  const filtered = personas.filter((item) => item.id !== record.id && !item.fixed);
  await writeJsonFile(PERSONAS_FILE, [...FIXED_PERSONAS, ...filtered, record]);
  return record;
}

export async function createMeetingSession(input: {
  title: string;
  consentAccepted: boolean;
}): Promise<MeetingSession> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  const session: MeetingSession = {
    sessionId: `session-${randomUUID()}`,
    title: input.title,
    status: "active",
    consentAccepted: input.consentAccepted,
    startedAt: new Date().toISOString(),
  };
  sessions.unshift(session);
  await writeJsonFile(MEETING_SESSIONS_FILE, sessions);
  return session;
}

export async function getMeetingSession(sessionId: string): Promise<MeetingSession | undefined> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  return sessions.find((session) => session.sessionId === sessionId);
}

export async function updateMeetingSession(session: MeetingSession): Promise<void> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  const updated = sessions.map((item) => (item.sessionId === session.sessionId ? session : item));
  await writeJsonFile(MEETING_SESSIONS_FILE, updated);
}

export async function appendTranscriptSegment(segment: TranscriptSegment): Promise<void> {
  const bucket = runtimeTranscripts.get(segment.sessionId) ?? [];
  bucket.push(segment);
  runtimeTranscripts.set(segment.sessionId, bucket.slice(-60));

  if (!config.persistTranscripts) {
    return;
  }

  const stored = await readJsonFile<TranscriptSegment[]>(TRANSCRIPTS_FILE, []);
  stored.push(segment);
  await writeJsonFile(TRANSCRIPTS_FILE, stored.slice(-3000));
}

export function getRecentRuntimeTranscript(sessionId: string, maxSegments = 20): TranscriptSegment[] {
  const bucket = runtimeTranscripts.get(sessionId) ?? [];
  return bucket.slice(-maxSegments);
}

export async function appendHandRaiseEvent(event: HandRaiseEvent): Promise<void> {
  const events = await readJsonFile<HandRaiseEvent[]>(HAND_RAISE_FILE, []);
  events.unshift(event);
  await writeJsonFile(HAND_RAISE_FILE, events.slice(0, 500));
}

export async function getHandRaiseEventsBySession(sessionId: string): Promise<HandRaiseEvent[]> {
  const events = await readJsonFile<HandRaiseEvent[]>(HAND_RAISE_FILE, []);
  return events.filter((event) => event.sessionId === sessionId);
}

export async function createInterviewSession(personaName: string, focusArea: string): Promise<PersonaInterviewSession> {
  const sessions = await readJsonFile<PersonaInterviewSession[]>(INTERVIEWS_FILE, []);
  const now = new Date().toISOString();
  const interview: PersonaInterviewSession = {
    interviewId: `interview-${randomUUID()}`,
    personaName,
    focusArea,
    turns: [],
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
  };
  sessions.unshift(interview);
  await writeJsonFile(INTERVIEWS_FILE, sessions);
  return interview;
}

export async function getInterviewSession(interviewId: string): Promise<PersonaInterviewSession | undefined> {
  const sessions = await readJsonFile<PersonaInterviewSession[]>(INTERVIEWS_FILE, []);
  return sessions.find((session) => session.interviewId === interviewId);
}

export async function updateInterviewSession(updated: PersonaInterviewSession): Promise<void> {
  const sessions = await readJsonFile<PersonaInterviewSession[]>(INTERVIEWS_FILE, []);
  const next = sessions.map((session) =>
    session.interviewId === updated.interviewId ? { ...updated, updatedAt: new Date().toISOString() } : session,
  );
  await writeJsonFile(INTERVIEWS_FILE, next);
}

export async function createShadowBoardRun(run: ShadowBoardRun): Promise<void> {
  const runs = await readJsonFile<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  runs.unshift(run);
  await writeJsonFile(SHADOW_BOARD_FILE, runs);
}

export async function updateShadowBoardRun(run: ShadowBoardRun): Promise<void> {
  const runs = await readJsonFile<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  const next = runs.map((item) => (item.runId === run.runId ? run : item));
  await writeJsonFile(SHADOW_BOARD_FILE, next);
}

export async function getShadowBoardRun(runId: string): Promise<ShadowBoardRun | undefined> {
  const runs = await readJsonFile<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  return runs.find((run) => run.runId === runId);
}

export async function appendUsageMetric(entry: Omit<UsageMetric, "id" | "createdAt">): Promise<void> {
  const metrics = await readJsonFile<UsageMetric[]>(USAGE_FILE, []);
  metrics.unshift({
    ...entry,
    id: `usage-${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });
  await writeJsonFile(USAGE_FILE, metrics.slice(0, 1500));
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const metrics = await readJsonFile<UsageMetric[]>(USAGE_FILE, []);
  const byFeature: Record<string, number> = {};

  let totalEstimatedCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const item of metrics) {
    totalEstimatedCostUsd += item.estimatedCostUsd;
    totalInputTokens += item.inputTokens;
    totalOutputTokens += item.outputTokens;
    byFeature[item.feature] = (byFeature[item.feature] ?? 0) + item.estimatedCostUsd;
  }

  return {
    totalEstimatedCostUsd,
    totalInputTokens,
    totalOutputTokens,
    byFeature,
    recent: metrics.slice(0, 20),
  };
}
