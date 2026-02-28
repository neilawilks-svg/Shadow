import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

import { GET as getMeetingSessions, POST as createMeetingSessionRoute } from "@/app/api/meeting/sessions/route";
import { GET as exportMeetingTranscript } from "@/app/api/meeting/sessions/[sessionId]/export/route";
import { GET as getShadowBoardRunRoute } from "@/app/api/shadow-board/runs/[runId]/route";
import { POST as createShadowBoardRunRoute } from "@/app/api/shadow-board/runs/route";
import { resetDemoData } from "@/lib/store/admin";

beforeEach(async () => {
  await resetDemoData();
});

describe("api contracts", () => {
  async function waitForShadowRunStatus(runId: string, timeoutMs = 4000): Promise<{ status: string; error?: string }> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const response = await getShadowBoardRunRoute(new Request(`http://localhost/api/shadow-board/runs/${runId}`), {
        params: Promise.resolve({ runId }),
      });
      const payload = (await response.json()) as { status: string; error?: string };
      if (payload.status !== "running" && payload.status !== "queued") {
        return payload;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { status: "timeout" };
  }

  it("lists meeting session summary fields", async () => {
    const createResponse = await createMeetingSessionRoute(
      new Request("http://localhost/api/meeting/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: "CAB test meeting",
          consentAccepted: true,
        }),
      }),
    );
    expect(createResponse.status).toBe(201);

    const listResponse = await getMeetingSessions(new Request("http://localhost/api/meeting/sessions?limit=5"));
    expect(listResponse.status).toBe(200);

    const payload = (await listResponse.json()) as {
      sessions: Array<{
        sessionId: string;
        title: string;
        transcriptCount: number;
        morganResponseCount: number;
      }>;
    };

    expect(payload.sessions.length).toBeGreaterThan(0);
    expect(payload.sessions[0]).toMatchObject({
      sessionId: expect.any(String),
      title: expect.any(String),
      transcriptCount: expect.any(Number),
      morganResponseCount: expect.any(Number),
    });
  });

  it("rejects unsupported transcript export format", async () => {
    const createResponse = await createMeetingSessionRoute(
      new Request("http://localhost/api/meeting/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: "CAB export test",
          consentAccepted: true,
        }),
      }),
    );
    const created = (await createResponse.json()) as { sessionId: string };

    const response = await exportMeetingTranscript(
      new Request("http://localhost/api/meeting/sessions/export?format=txt"),
      {
        params: Promise.resolve({ sessionId: created.sessionId }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid shadow board payloads", async () => {
    const response = await createShadowBoardRunRoute(
      new Request("http://localhost/api/shadow-board/runs", {
        method: "POST",
        body: JSON.stringify({
          agenda: "",
          topics: [],
          personaIds: [],
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Invalid shadow board run payload");
  });

  it("returns explicit failure when member profiles are missing", async () => {
    const profilePath = path.join(process.cwd(), "local", "board-vault", "agent-profiles.json");
    const backupPath = `${profilePath}.bak-test`;
    const peopleDir = path.join(process.cwd(), "local", "board-vault", "people");
    const peopleBackupDir = `${peopleDir}.bak-test`;
    let hadOriginal = false;
    let hadPeopleDir = false;

    try {
      await fs.stat(profilePath);
      hadOriginal = true;
      await fs.rename(profilePath, backupPath);
    } catch {
      hadOriginal = false;
    }

    try {
      await fs.stat(peopleDir);
      hadPeopleDir = true;
      await fs.rename(peopleDir, peopleBackupDir);
    } catch {
      hadPeopleDir = false;
    }

    try {
      const response = await createShadowBoardRunRoute(
        new Request("http://localhost/api/shadow-board/runs", {
          method: "POST",
          body: JSON.stringify({
            agenda: "CAB profile coverage test",
            topics: ["risk"],
            personaIds: ["anthony-battle"],
            maxConversationTurns: 3,
          }),
        }),
      );

      expect(response.status).toBe(201);
      const payload = (await response.json()) as { runId: string; status: string };
      expect(payload.status).toBe("running");
      expect(payload.runId).toEqual(expect.any(String));

      const terminal = await waitForShadowRunStatus(payload.runId);
      expect(terminal.status).toBe("failed");
      expect(terminal.error ?? "").toMatch(
        /Board-member agent profiles are missing|Insufficient speaking quorum after profile validation/,
      );
    } finally {
      if (hadPeopleDir) {
        await fs.rename(peopleBackupDir, peopleDir);
      } else {
        await fs.rm(peopleBackupDir, { recursive: true, force: true });
      }
      if (hadOriginal) {
        await fs.rename(backupPath, profilePath);
      } else {
        await fs.rm(backupPath, { force: true });
      }
    }
  });
});
