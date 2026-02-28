import { beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

import { startShadowBoardRun } from "@/lib/agents/shadow-board";
import { hasOpenAiKey } from "@/lib/openai/client";
import { resetDemoData } from "@/lib/store/admin";

beforeEach(async () => {
  await resetDemoData();
});

function sampleProfile(personaId: string, name: string, motivation: string) {
  return {
    personaId,
    name,
    executiveSummary: `${name} executive summary`,
    coreMotivations: [motivation],
    decisionHeuristics: [`${name} heuristic one`],
    supportTriggers: [`${name} support trigger`],
    challengeTriggers: [`${name} challenge trigger`],
    riskBias: "balanced",
    discType: "D",
    discArchetype: "Captain",
    energizers: [`${name} energizer`],
    drainers: [`${name} drainer`],
    strengths: [`${name} strength`],
    blindSpots: [`${name} blind spot`],
    languagePatternsToUse: [`${name} asks for evidence`],
    languagePatternsToAvoid: ["Avoid boilerplate phrasing"],
    sourceDocIds: [`${personaId}-doc`],
    sourcePaths: [`/tmp/${personaId}.md`],
    generatedAt: "2026-02-19T00:00:00Z",
  };
}

describe("shadow board integration", () => {
  it("produces non-identical first comments across speaking members", async () => {
    if (hasOpenAiKey()) {
      // Keep tests deterministic and offline.
      return;
    }

    const profilePath = path.join(process.cwd(), "local", "board-vault", "agent-profiles.json");
    const backupPath = `${profilePath}.bak-test`;
    let hadOriginal = false;

    try {
      await fs.mkdir(path.dirname(profilePath), { recursive: true });
      try {
        await fs.stat(profilePath);
        hadOriginal = true;
        await fs.rename(profilePath, backupPath);
      } catch {
        hadOriginal = false;
      }

      const profiles = {
        generatedAt: "2026-02-19T00:00:00Z",
        profiles: [
          sampleProfile("anthony-battle", "Anthony Battle", "Move quickly with delivery accountability"),
          sampleProfile("constantin-beier", "Constantin Beier", "Strengthen governance and risk controls"),
          sampleProfile("dean-curtis", "Dean Curtis", "Maximize customer value with execution discipline"),
          sampleProfile("gabi-wagenhofer", "Gabi Wagenhofer", "Protect platform resilience while modernizing"),
          sampleProfile("karan-khanna", "Karan Khanna", "Drive operational performance with measurable outcomes"),
        ],
      };
      await fs.writeFile(profilePath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");

      const run = await startShadowBoardRun({
        shadowSessionId: "test-shadow-session",
        agenda: "CAB prep",
        topics: ["pricing", "risk"],
        personaIds: ["anthony-battle", "constantin-beier", "dean-curtis", "gabi-wagenhofer", "karan-khanna"],
        maxConversationTurns: 6,
        randomness: 0.2,
      });

      expect(run.status).toBe("completed");
      expect(run.outputs.length).toBeGreaterThanOrEqual(5);

      const firstComments = run.outputs.map((output) => output.comment.trim());
      const uniqueComments = new Set(firstComments);
      expect(uniqueComments.size).toBeGreaterThanOrEqual(4);

      for (const output of run.outputs) {
        expect(output.comment).toContain("Position:");
        expect(output.comment).toContain("Insight:");
        expect(output.comment).toContain("Advice:");
        expect(output.comment).toContain("Question:");
        expect(output.position).toBeTruthy();
        expect((output.insights ?? []).length).toBeGreaterThanOrEqual(2);
        expect((output.advice ?? []).length).toBeGreaterThanOrEqual(1);
        expect((output.questions ?? []).length).toBeGreaterThanOrEqual(1);
      }

      const transcript = (run.sharedTranscript ?? []).join("\n");
      expect(transcript).toContain("Position:");
      expect(transcript).toContain("Insight:");
      expect(transcript).toContain("Advice:");
      expect(transcript).toContain("Question:");
    } finally {
      if (hadOriginal) {
        await fs.rename(backupPath, profilePath);
      } else {
        await fs.rm(profilePath, { force: true });
        await fs.rm(backupPath, { force: true });
      }
    }
  });
});
