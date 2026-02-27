import { describe, expect, it } from "vitest";

import { buildTranscriptExport } from "@/lib/meeting/transcript-export";
import type { TranscriptSegment } from "@/types/domain";

const segments: TranscriptSegment[] = [
  {
    sessionId: "session-1",
    segmentId: "segment-1",
    speaker: "chair",
    text: "Welcome everyone.",
    confidence: 0.92,
    startedAt: "2026-03-04T09:00:00.000Z",
    endedAt: "2026-03-04T09:00:02.000Z",
  },
  {
    sessionId: "session-1",
    segmentId: "segment-2",
    speaker: "morgan",
    text: "Consider a staged pilot before full rollout.",
    confidence: 0.89,
    startedAt: "2026-03-04T09:00:03.000Z",
    endedAt: "2026-03-04T09:00:06.500Z",
  },
];

describe("transcript export", () => {
  it("builds markdown export", () => {
    const output = buildTranscriptExport("session-1", "md", segments);
    expect(output.fileName).toBe("session-1-transcript.md");
    expect(output.contentType).toBe("text/markdown");
    expect(output.body).toContain("# Meeting Transcript (session-1)");
    expect(output.body).toContain("`chair`: Welcome everyone.");
  });

  it("builds json export", () => {
    const output = buildTranscriptExport("session-1", "json", segments);
    expect(output.fileName).toBe("session-1-transcript.json");
    expect(output.contentType).toBe("application/json");

    const parsed = JSON.parse(output.body) as { sessionId: string; segments: TranscriptSegment[] };
    expect(parsed.sessionId).toBe("session-1");
    expect(parsed.segments).toHaveLength(2);
  });

  it("builds srt export", () => {
    const output = buildTranscriptExport("session-1", "srt", segments);
    expect(output.fileName).toBe("session-1-transcript.srt");
    expect(output.contentType).toBe("application/x-subrip");
    expect(output.body).toContain("1\n09:00:00,000 --> 09:00:02,000\nchair: Welcome everyone.");
    expect(output.body).toContain("2\n09:00:03,000 --> 09:00:06,500\nmorgan: Consider a staged pilot before full rollout.");
  });

  it("handles empty transcript segments", () => {
    const output = buildTranscriptExport("session-empty", "srt", []);
    expect(output.body).toBe("\n");
  });

  it("handles malformed and overlapping segment timestamps for srt", () => {
    const output = buildTranscriptExport("session-1", "srt", [
      {
        sessionId: "session-1",
        segmentId: "bad-1",
        speaker: "speaker",
        text: "bad row",
        confidence: 0.8,
        startedAt: "bad-time",
        endedAt: "bad-time",
      },
      {
        sessionId: "session-1",
        segmentId: "overlap-1",
        speaker: "speaker",
        text: "First line",
        confidence: 0.8,
        startedAt: "2026-03-04T09:00:02.000Z",
        endedAt: "2026-03-04T09:00:01.000Z",
      },
      {
        sessionId: "session-1",
        segmentId: "good-1",
        speaker: "morgan",
        text: "Second line",
        confidence: 0.8,
        startedAt: "2026-03-04T09:00:03.000Z",
        endedAt: "2026-03-04T09:00:04.000Z",
      },
    ]);

    expect(output.body).toContain("1\n09:00:02,000 --> 09:00:02,001\nspeaker: First line");
    expect(output.body).toContain("2\n09:00:03,000 --> 09:00:04,000\nmorgan: Second line");
    expect(output.body).not.toContain("bad row");
  });
});
