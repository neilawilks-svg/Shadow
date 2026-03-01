import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";

import type {
  DocumentRecord,
  HandRaiseEvent,
  MeetingSession,
  MorganResponse,
  PersonaInterviewSession,
  PersonaProfile,
  ShadowBoardRun,
  ShadowBoardRunEvent,
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
const SHADOW_BOARD_EVENTS_FILE = "shadow-board-events.json";
const USAGE_FILE = "usage-metrics.json";
const DOCUMENTS_FILE = "documents.json";
const BOARD_MEMBER_PROFILE_FILE = path.join(process.cwd(), "local", "board-vault", "agent-profiles.json");
const BOARD_MEMBER_PROFILE_FALLBACK_FILE = path.join(process.cwd(), "data", "board-member-agent-profiles.json");
const BOARD_MEMBER_PROFILE_SOURCE_DIR = path.join(process.cwd(), "local", "board-vault", "people");
const BLOB_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const BLOB_BASE_URL = "https://blob.vercel-storage.com";
const SHADOW_STATE_PREFIX = "state/shadow-board";
const SHADOW_RUN_FILE_PREFIX = "shadow-board-run";
const SHADOW_RUN_EVENTS_FILE_PREFIX = "shadow-board-run-events";
const SHADOW_BLOB_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

type BoardMemberAgentProfile = {
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
};

type BoardMemberProfilePack = {
  generatedAt: string;
  profiles: BoardMemberAgentProfile[];
};

declare global {
  var __runtimeTranscripts: Map<string, TranscriptSegment[]> | undefined;
}

const runtimeTranscripts = globalThis.__runtimeTranscripts ?? new Map<string, TranscriptSegment[]>();
globalThis.__runtimeTranscripts = runtimeTranscripts;

function shouldUseShadowBlobState(): boolean {
  return Boolean(BLOB_WRITE_TOKEN);
}

export function getShadowStateBackend(): "blob" | "file" {
  return shouldUseShadowBlobState() ? "blob" : "file";
}

function buildShadowBlobUrl(fileName: string, write = false): string {
  const base = `${BLOB_BASE_URL}/${SHADOW_STATE_PREFIX}/${fileName}`;
  if (!write) {
    return base;
  }
  return `${base}?access=public&addRandomSuffix=0`;
}

function buildShadowBlobReadUrl(fileName: string): string {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${buildShadowBlobUrl(fileName)}?t=${nonce}`;
}

async function readShadowStateJson<T>(fileName: string, fallback: T): Promise<T> {
  if (!shouldUseShadowBlobState()) {
    return readJsonFile<T>(fileName, fallback);
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        buildShadowBlobReadUrl(fileName),
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${BLOB_WRITE_TOKEN}`,
          },
          cache: "no-store",
        },
        SHADOW_BLOB_TIMEOUT_MS,
      );

      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status === 404) {
        return fallback;
      }
    } catch {
      // Retry transient blob read failures before surfacing unavailability.
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }

  throw new Error(`Shadow state read unavailable for ${fileName}.`);
}

async function writeShadowStateJson<T>(fileName: string, value: T): Promise<void> {
  if (shouldUseShadowBlobState()) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          buildShadowBlobUrl(fileName, true),
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${BLOB_WRITE_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: `${JSON.stringify(value, null, 2)}\n`,
          },
          SHADOW_BLOB_TIMEOUT_MS,
        );
        if (response.ok) {
          return;
        }
      } catch {
        // Retry transient blob write failures before failing hard.
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }
    }
    throw new Error(`Unable to persist ${fileName} to blob store.`);
  }

  try {
    await writeJsonFile(fileName, value);
    return;
  } catch {
    throw new Error(`Unable to persist ${fileName} to file store.`);
  }
}

function normalizePersonaRole(role: unknown): PersonaProfile["role"] {
  return role === "slalom_facilitator" ? "slalom_facilitator" : "board_member";
}

function normalizePersonaProfile(persona: PersonaProfile): PersonaProfile {
  return {
    ...persona,
    role: normalizePersonaRole((persona as PersonaProfile & { role?: unknown }).role),
    personaPdfUrl: typeof persona.personaPdfUrl === "string" && persona.personaPdfUrl.trim() ? persona.personaPdfUrl : undefined,
    personaPdfFileName:
      typeof persona.personaPdfFileName === "string" && persona.personaPdfFileName.trim()
        ? persona.personaPdfFileName
        : undefined,
  };
}

export async function getPersonas(): Promise<PersonaProfile[]> {
  const existing = await readJsonFile<PersonaProfile[]>(PERSONAS_FILE, []);
  const dynamic = existing.filter((persona) => !persona.fixed).map(normalizePersonaProfile);
  const merged = [...FIXED_PERSONAS.map(normalizePersonaProfile), ...dynamic];
  await writeJsonFile(PERSONAS_FILE, merged);
  return merged;
}

export async function savePersona(persona: Omit<PersonaProfile, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<PersonaProfile> {
  const personas = await getPersonas();
  const now = new Date().toISOString();
  const record: PersonaProfile = {
    ...persona,
    role: normalizePersonaRole((persona as { role?: unknown }).role),
    personaPdfUrl: typeof persona.personaPdfUrl === "string" && persona.personaPdfUrl.trim() ? persona.personaPdfUrl : undefined,
    personaPdfFileName:
      typeof persona.personaPdfFileName === "string" && persona.personaPdfFileName.trim()
        ? persona.personaPdfFileName
        : undefined,
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
  const now = new Date().toISOString();
  const session: MeetingSession = {
    sessionId: `session-${randomUUID()}`,
    title: input.title,
    status: "active",
    consentAccepted: input.consentAccepted,
    startedAt: now,
    updatedAt: now,
    linkedDocumentIds: [],
    morganResponses: [],
    transcriptSegmentIds: [],
    notes: [],
  };
  sessions.unshift(session);
  await writeJsonFile(MEETING_SESSIONS_FILE, sessions);
  return session;
}

export async function getMeetingSession(sessionId: string): Promise<MeetingSession | undefined> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  return sessions.find((session) => session.sessionId === sessionId);
}

export async function listMeetingSessions(limit = 100): Promise<MeetingSession[]> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  return sessions.slice(0, Math.max(1, limit));
}

export async function updateMeetingSession(session: MeetingSession): Promise<void> {
  const sessions = await readJsonFile<MeetingSession[]>(MEETING_SESSIONS_FILE, []);
  const updatedSession: MeetingSession = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  const updated = sessions.map((item) => (item.sessionId === session.sessionId ? updatedSession : item));
  await writeJsonFile(MEETING_SESSIONS_FILE, updated);
}

export async function endMeetingSession(sessionId: string): Promise<MeetingSession | undefined> {
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return undefined;
  }

  const ended: MeetingSession = {
    ...session,
    status: "ended",
    endedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await updateMeetingSession(ended);
  return ended;
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

  const session = await getMeetingSession(segment.sessionId);
  if (session) {
    session.transcriptSegmentIds = [...(session.transcriptSegmentIds ?? []), segment.segmentId].slice(-5000);
    session.updatedAt = new Date().toISOString();
    await updateMeetingSession(session);
  }
}

export async function getRecentRuntimeTranscript(sessionId: string, maxSegments = 20): Promise<TranscriptSegment[]> {
  const bucket = runtimeTranscripts.get(sessionId) ?? [];
  if (bucket.length > 0) {
    return bucket.slice(-maxSegments);
  }

  if (!config.persistTranscripts) {
    return [];
  }

  const stored = await readJsonFile<TranscriptSegment[]>(TRANSCRIPTS_FILE, []);
  return stored.filter((segment) => segment.sessionId === sessionId).slice(-maxSegments);
}

export async function getTranscriptSegmentsBySession(sessionId: string): Promise<TranscriptSegment[]> {
  if (!config.persistTranscripts) {
    return getRecentRuntimeTranscript(sessionId, 5000);
  }

  const stored = await readJsonFile<TranscriptSegment[]>(TRANSCRIPTS_FILE, []);
  return stored.filter((segment) => segment.sessionId === sessionId);
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

export async function appendMorganResponse(
  sessionId: string,
  response: Omit<MorganResponse, "responseId" | "sessionId" | "createdAt"> & { createdAt?: string },
): Promise<MorganResponse | null> {
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return null;
  }

  const record: MorganResponse = {
    responseId: `morgan-response-${randomUUID()}`,
    sessionId,
    text: response.text,
    question: response.question,
    createdAt: response.createdAt ?? new Date().toISOString(),
    audioPath: response.audioPath,
    autoplay: response.autoplay ?? true,
  };

  session.morganResponses = [record, ...(session.morganResponses ?? [])].slice(0, 400);
  session.updatedAt = new Date().toISOString();
  await updateMeetingSession(session);

  return record;
}

export async function getMorganResponsesBySession(sessionId: string): Promise<MorganResponse[]> {
  const session = await getMeetingSession(sessionId);
  return session?.morganResponses ?? [];
}

export async function attachDocumentsToSession(sessionId: string, documentIds: string[]): Promise<MeetingSession | undefined> {
  const session = await getMeetingSession(sessionId);
  if (!session) {
    return undefined;
  }

  const deduped = Array.from(new Set([...(session.linkedDocumentIds ?? []), ...documentIds]));
  session.linkedDocumentIds = deduped;
  session.updatedAt = new Date().toISOString();
  await updateMeetingSession(session);
  return session;
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
  const runFileName = `${SHADOW_RUN_FILE_PREFIX}-${run.runId}.json`;
  // Persist canonical per-run state first so polling/ticks can always find the run.
  await writeShadowStateJson(runFileName, run);

  // Keep global index best-effort to avoid blocking run creation on index write pressure.
  try {
    const runs = await readShadowStateJson<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
    runs.unshift(run);
    await writeShadowStateJson(SHADOW_BOARD_FILE, runs);
  } catch {
    // list/recent-runs index is non-critical for active run lifecycle
  }

  // Hard guarantee: do not report a started run unless it can be read back.
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      const persisted = await readShadowStateJson<ShadowBoardRun | null>(runFileName, null);
      if (persisted?.runId === run.runId) {
        return;
      }
    } catch {
      // Retry read-after-write checks on transient storage issues.
    }

    if (attempt < 15) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(300 * attempt, 2_000)));
    }
  }

  throw new Error(`Run state write verification failed for ${run.runId}.`);
}

export async function updateShadowBoardRun(run: ShadowBoardRun): Promise<void> {
  await writeShadowStateJson(`${SHADOW_RUN_FILE_PREFIX}-${run.runId}.json`, run);

  // Keep the global index lightweight during active turns to reduce blob write pressure.
  // The per-run file is the canonical source for active polling.
  const shouldSyncIndex =
    run.status === "completed" || run.status === "failed" || run.status === "queued" || (run.lastCompletedTurn ?? 0) === 0;
  if (!shouldSyncIndex) {
    return;
  }

  const runs = await readShadowStateJson<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  let found = false;
  const next = runs.map((item) => {
    if (item.runId === run.runId) {
      found = true;
      return run;
    }
    return item;
  });
  if (!found) {
    next.unshift(run);
  }
  await writeShadowStateJson(SHADOW_BOARD_FILE, next);
}

export async function getShadowBoardRun(runId: string): Promise<ShadowBoardRun | undefined> {
  const singleFileName = `${SHADOW_RUN_FILE_PREFIX}-${runId}.json`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const runFromSingleFile = await readShadowStateJson<ShadowBoardRun | null>(singleFileName, null);
    if (runFromSingleFile && runFromSingleFile.runId === runId) {
      return runFromSingleFile;
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  const runs = await readShadowStateJson<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  return runs.find((run) => run.runId === runId);
}

export async function listShadowBoardRuns(limit = 100): Promise<ShadowBoardRun[]> {
  const runs = await readShadowStateJson<ShadowBoardRun[]>(SHADOW_BOARD_FILE, []);
  return runs.slice(0, Math.max(1, limit));
}

export async function appendShadowBoardRunEvent(event: ShadowBoardRunEvent): Promise<void> {
  const perRunEvents = await readShadowStateJson<ShadowBoardRunEvent[]>(`${SHADOW_RUN_EVENTS_FILE_PREFIX}-${event.runId}.json`, []);
  perRunEvents.push(event);
  await writeShadowStateJson(`${SHADOW_RUN_EVENTS_FILE_PREFIX}-${event.runId}.json`, perRunEvents.slice(-5000));

  // Keep global event log best-effort to reduce write pressure in active runs.
  try {
    const events = await readShadowStateJson<ShadowBoardRunEvent[]>(SHADOW_BOARD_EVENTS_FILE, []);
    events.push(event);
    await writeShadowStateJson(SHADOW_BOARD_EVENTS_FILE, events.slice(-5000));
  } catch {
    // per-run event stream is canonical for run recovery
  }
}

export async function getShadowBoardRunEvents(runId: string, limit = 500): Promise<ShadowBoardRunEvent[]> {
  const perRunEvents = await readShadowStateJson<ShadowBoardRunEvent[]>(
    `${SHADOW_RUN_EVENTS_FILE_PREFIX}-${runId}.json`,
    [],
  );
  if (perRunEvents.length > 0) {
    if (perRunEvents.length <= limit) {
      return perRunEvents;
    }
    return perRunEvents.slice(perRunEvents.length - Math.max(1, limit));
  }

  const events = await readShadowStateJson<ShadowBoardRunEvent[]>(SHADOW_BOARD_EVENTS_FILE, []);
  const filtered = events.filter((event) => event.runId === runId);
  if (filtered.length <= limit) {
    return filtered;
  }
  return filtered.slice(filtered.length - Math.max(1, limit));
}

export async function listDocuments(limit = 1000): Promise<DocumentRecord[]> {
  const records = await readJsonFile<DocumentRecord[]>(DOCUMENTS_FILE, []);
  return records.slice(0, Math.max(1, limit));
}

export async function getDocumentById(documentId: string): Promise<DocumentRecord | undefined> {
  const records = await readJsonFile<DocumentRecord[]>(DOCUMENTS_FILE, []);
  return records.find((record) => record.id === documentId);
}

export async function upsertDocuments(documents: DocumentRecord[]): Promise<DocumentRecord[]> {
  const existing = await readJsonFile<DocumentRecord[]>(DOCUMENTS_FILE, []);
  const byId = new Map(existing.map((record) => [record.id, record]));

  for (const record of documents) {
    byId.set(record.id, record);
  }

  const next = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await writeJsonFile(DOCUMENTS_FILE, next);
  return next;
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

export async function getBoardMemberProfilePack(): Promise<BoardMemberProfilePack | null> {
  const candidates = [BOARD_MEMBER_PROFILE_FILE, BOARD_MEMBER_PROFILE_FALLBACK_FILE];

  for (const profilePath of candidates) {
    try {
      const raw = await fs.readFile(profilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BoardMemberProfilePack>;
      if (!parsed || !Array.isArray(parsed.profiles)) {
        continue;
      }

      const profiles: BoardMemberAgentProfile[] = parsed.profiles
        .map((item) => ({
          personaId: String(item.personaId ?? ""),
          name: String(item.name ?? ""),
          executiveSummary: String(item.executiveSummary ?? ""),
          coreMotivations: Array.isArray(item.coreMotivations) ? item.coreMotivations.map(String) : [],
          decisionHeuristics: Array.isArray(item.decisionHeuristics) ? item.decisionHeuristics.map(String) : [],
          supportTriggers: Array.isArray(item.supportTriggers) ? item.supportTriggers.map(String) : [],
          challengeTriggers: Array.isArray(item.challengeTriggers) ? item.challengeTriggers.map(String) : [],
          riskBias: String(item.riskBias ?? "balanced"),
          discType: String(item.discType ?? ""),
          discArchetype: String(item.discArchetype ?? ""),
          energizers: Array.isArray(item.energizers) ? item.energizers.map(String) : [],
          drainers: Array.isArray(item.drainers) ? item.drainers.map(String) : [],
          strengths: Array.isArray(item.strengths) ? item.strengths.map(String) : [],
          blindSpots: Array.isArray(item.blindSpots) ? item.blindSpots.map(String) : [],
          languagePatternsToUse: Array.isArray(item.languagePatternsToUse)
            ? item.languagePatternsToUse.map(String)
            : [],
          languagePatternsToAvoid: Array.isArray(item.languagePatternsToAvoid)
            ? item.languagePatternsToAvoid.map(String)
            : [],
          sourceDocIds: Array.isArray(item.sourceDocIds) ? item.sourceDocIds.map(String) : [],
          sourcePaths: Array.isArray(item.sourcePaths) ? item.sourcePaths.map(String) : [],
          generatedAt: String(item.generatedAt ?? parsed.generatedAt ?? ""),
        }))
        .filter((item) => item.personaId.length > 0 && item.name.length > 0);

      if (profiles.length === 0) {
        continue;
      }

      return {
        generatedAt: String(parsed.generatedAt ?? ""),
        profiles,
      };
    } catch {
      // Try the next profile source if current one is unavailable.
    }
  }

  return null;
}

export async function isBoardMemberProfilePackStale(): Promise<boolean> {
  try {
    const [localProfileStat, fallbackProfileStat] = await Promise.all([
      fs.stat(BOARD_MEMBER_PROFILE_FILE).catch(() => null),
      fs.stat(BOARD_MEMBER_PROFILE_FALLBACK_FILE).catch(() => null),
    ]);

    // Hosted environments generally rely on the committed fallback profile pack.
    if (!localProfileStat && fallbackProfileStat) {
      return false;
    }

    const profileStat = localProfileStat ?? fallbackProfileStat;
    if (!profileStat) {
      return true;
    }

    const sourceEntries = await fs.readdir(BOARD_MEMBER_PROFILE_SOURCE_DIR, { withFileTypes: true }).catch(() => []);
    const sourceFiles = sourceEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => path.join(BOARD_MEMBER_PROFILE_SOURCE_DIR, entry.name));

    if (sourceFiles.length === 0) {
      return false;
    }

    const sourceStats = await Promise.all(
      sourceFiles.map(async (filePath) => {
        try {
          return await fs.stat(filePath);
        } catch {
          return null;
        }
      }),
    );

    const newestSourceMtime = sourceStats.reduce((current, stat) => {
      if (!stat) {
        return current;
      }
      return Math.max(current, stat.mtimeMs);
    }, 0);

    return newestSourceMtime > profileStat.mtimeMs;
  } catch {
    return true;
  }
}
