import { beforeEach, describe, expect, it } from "vitest";

import { POST as createShadowBoardRunRoute } from "@/app/api/shadow-board/runs/route";
import { resetDemoData } from "@/lib/store/admin";

beforeEach(async () => {
  await resetDemoData();
});

describe("shadow board runs schema", () => {
  it("rejects agenda item percentages that do not total 100", async () => {
    const response = await createShadowBoardRunRoute(
      new Request("http://localhost/api/shadow-board/runs", {
        method: "POST",
        body: JSON.stringify({
          agendaItems: [
            { id: "a", title: "Topic A", timePercent: 60, desiredOutput: "Output A", questions: [] },
            { id: "b", title: "Topic B", timePercent: 30, desiredOutput: "Output B", questions: [] },
          ],
          personaIds: ["anthony-battle", "constantin-beier", "dean-curtis"],
          maxConversationTurns: 3,
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("accepts valid agenda items payload", async () => {
    const response = await createShadowBoardRunRoute(
      new Request("http://localhost/api/shadow-board/runs", {
        method: "POST",
        body: JSON.stringify({
          agendaItems: [
            { id: "a", title: "Topic A", timePercent: 70, desiredOutput: "Output A", questions: ["Q1"] },
            { id: "b", title: "Topic B", timePercent: 30, desiredOutput: "Output B", questions: ["Q2"] },
          ],
          personaIds: ["anthony-battle", "constantin-beier", "dean-curtis"],
          maxConversationTurns: 3,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { runId: string };
    expect(payload.runId).toEqual(expect.any(String));
  });

  it("accepts legacy agenda/topics payload", async () => {
    const response = await createShadowBoardRunRoute(
      new Request("http://localhost/api/shadow-board/runs", {
        method: "POST",
        body: JSON.stringify({
          agenda: "Legacy agenda",
          topics: ["risk", "governance"],
          personaIds: ["anthony-battle", "constantin-beier", "dean-curtis"],
          maxConversationTurns: 3,
        }),
      }),
    );

    expect(response.status).toBe(201);
  });
});
