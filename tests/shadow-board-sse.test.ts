import { beforeEach, describe, expect, it } from "vitest";

import { GET as getShadowBoardEventsRoute } from "@/app/api/shadow-board/events/[runId]/route";
import { POST as createShadowBoardRunRoute } from "@/app/api/shadow-board/runs/route";
import { resetDemoData } from "@/lib/store/admin";

beforeEach(async () => {
  await resetDemoData();
});

describe("shadow board SSE", () => {
  it("emits run_started history event for new runs", async () => {
    const createResponse = await createShadowBoardRunRoute(
      new Request("http://localhost/api/shadow-board/runs", {
        method: "POST",
        body: JSON.stringify({
          agenda: "CAB stream contract test",
          topics: ["risk", "governance"],
          personaIds: ["anthony-battle", "constantin-beier", "dean-curtis"],
          maxConversationTurns: 3,
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { runId: string };
    expect(created.runId).toEqual(expect.any(String));

    const response = await getShadowBoardEventsRoute(new Request("http://localhost/api/shadow-board/events"), {
      params: Promise.resolve({ runId: created.runId }),
    });
    expect(response.status).toBe(200);
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    await reader.cancel();

    const chunk = decoder.decode(value ?? new Uint8Array());
    expect(chunk).toContain("data:");
    expect(chunk).toMatch(/\"type\":\"run_(started|failed|completed)\"/);
  });
});
