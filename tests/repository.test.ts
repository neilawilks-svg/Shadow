import { describe, expect, it } from "vitest";

import { createMeetingSession, getMeetingSession, getPersonas } from "@/lib/store/repository";

describe("repository", () => {
  it("creates and retrieves meeting session", async () => {
    const created = await createMeetingSession({
      title: "Test Session",
      consentAccepted: true,
    });

    const loaded = await getMeetingSession(created.sessionId);
    expect(loaded?.sessionId).toBe(created.sessionId);
    expect(loaded?.consentAccepted).toBe(true);
  });

  it("returns fixed personas", async () => {
    const personas = await getPersonas();
    expect(personas.length).toBeGreaterThanOrEqual(8);
  });
});
