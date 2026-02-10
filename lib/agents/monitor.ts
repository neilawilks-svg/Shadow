import { randomUUID } from "node:crypto";

import { config } from "@/lib/config";
import { publishMeetingEvent } from "@/lib/events/meeting-event-bus";
import { runJsonModel } from "@/lib/openai/json-response";
import {
  appendHandRaiseEvent,
  getMeetingSession,
  getRecentRuntimeTranscript,
  updateMeetingSession,
} from "@/lib/store/repository";
import type { HandRaiseEvent, InterventionCandidate } from "@/types/domain";

const COOLDOWN_MS = 2 * 60 * 1000;

interface MonitorResult {
  action: "no_action" | "raise_hand";
  confidence: number;
  patternType:
    | "contradiction"
    | "missed_connection"
    | "risk"
    | "opportunity"
    | "long_horizon"
    | "none";
  evidence: string;
  suggestion: string;
  priority: "low" | "medium" | "high";
  headline: string;
}

export async function evaluateAndMaybeRaiseHand(sessionId: string): Promise<InterventionCandidate | null> {
  const session = await getMeetingSession(sessionId);
  if (!session || session.status !== "active") {
    return null;
  }

  if (session.lastHandRaisedAt) {
    const sinceLast = Date.now() - new Date(session.lastHandRaisedAt).getTime();
    if (sinceLast < COOLDOWN_MS) {
      return null;
    }
  }

  const transcript = getRecentRuntimeTranscript(sessionId, 24)
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  if (!transcript.trim()) {
    return null;
  }

  const fallback: MonitorResult = {
    action: "no_action",
    confidence: 0.2,
    patternType: "none",
    evidence: "Insufficient context to recommend intervention.",
    suggestion: "Continue listening.",
    priority: "low",
    headline: "No intervention",
  };

  const result = await runJsonModel<MonitorResult>(
    {
      model: config.modelMonitor,
      feature: "meeting_monitor",
      systemPrompt:
        "You are Morgan, a board-observer model. Decide whether to raise a virtual hand. Raise only for meaningful contradiction, risk, missed connection, or strategic blind spot. Keep output concise.",
      userPrompt: `Analyze this meeting transcript window and decide if Morgan should raise a hand now:\n\n${transcript}`,
    },
    fallback,
  );

  if (result.action !== "raise_hand" || result.confidence < 0.55) {
    return {
      sessionId,
      action: "no_action",
      confidence: result.confidence,
      patternType: result.patternType,
      evidence: result.evidence,
      suggestion: result.suggestion,
      priority: result.priority,
    };
  }

  const candidate: InterventionCandidate = {
    sessionId,
    action: "raise_hand",
    confidence: result.confidence,
    patternType: result.patternType,
    evidence: result.evidence,
    suggestion: result.suggestion,
    priority: result.priority,
  };

  const event: HandRaiseEvent = {
    eventId: `evt-${randomUUID()}`,
    sessionId,
    personaId: "morgan-core",
    headline: result.headline || "Morgan has a perspective",
    details: `${result.evidence}\n\nSuggestion: ${result.suggestion}`,
    createdAt: new Date().toISOString(),
    status: "queued",
    candidate,
  };

  session.lastHandRaisedAt = new Date().toISOString();
  await updateMeetingSession(session);
  await appendHandRaiseEvent(event);
  publishMeetingEvent(sessionId, event);

  return candidate;
}
