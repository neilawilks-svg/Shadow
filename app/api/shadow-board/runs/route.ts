import { z } from "zod";

import { startShadowBoardRunAsync } from "@/lib/agents/shadow-board";
import { jsonCreated, jsonError, jsonOk } from "@/lib/http";
import { getShadowStateBackend, listShadowBoardRuns } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const agendaItemSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(240),
  timePercent: z.number().int().min(1).max(100),
  detailedDescription: z.string().trim().max(20000).optional().default(""),
  desiredOutput: z.string().trim().max(4000).optional().default(""),
  questions: z.array(z.string().trim().min(1).max(500)).max(10).optional().default([]),
});

const schema = z
  .object({
  agenda: z.string().trim().optional(),
  topics: z.array(z.string()).max(20).optional().default([]),
  agendaItems: z.array(agendaItemSchema).max(12).optional(),
  personaIds: z.array(z.string()).min(1).max(40),
  meetingId: z.string().optional(),
  shadowSessionId: z.string().min(1).max(120).optional(),
  documentIds: z.array(z.string()).max(100).optional().default([]),
  reasoningLevel: z.number().min(1).max(10).optional().default(6),
  maxConversationTurns: z.number().int().min(3).max(30).optional().default(24),
  randomness: z.number().min(0).max(1).optional().default(0.2),
  meetingArtifacts: z.array(z.string()).max(24).optional().default([]),
  outputFormat: z.enum(["markdown", "plain_text"]).optional().default("markdown"),
  targetWordCount: z.number().int().min(150).max(4000).optional().default(600),
  transcriptSeed: z.array(z.string()).max(60).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.agendaItems && value.agendaItems.length > 0) {
      const total = value.agendaItems.reduce((sum, item) => sum + item.timePercent, 0);
      if (total !== 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Agenda item time percentages must total exactly 100.",
          path: ["agendaItems"],
        });
      }
      return;
    }

    if (!value.agenda || !value.agenda.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agenda is required when agendaItems are not provided.",
        path: ["agenda"],
      });
    }
  });

export async function POST(request: Request) {
  try {
    const backend = getShadowStateBackend();
    if (process.env.VERCEL === "1" && backend !== "blob") {
      return jsonError(
        "Durable run state is not configured for this deployment. Set BLOB_READ_WRITE_TOKEN in this Vercel environment and redeploy.",
        503,
        { backend },
      );
    }

    const payload = await request.json().catch(() => null);
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      return jsonError("Invalid shadow board run payload.", 400, parsed.error.flatten());
    }

    const agendaItems = parsed.data.agendaItems?.length
      ? parsed.data.agendaItems.map((item, index) => ({
          id: item.id ?? `agenda-item-${index + 1}`,
          title: item.title,
          timePercent: item.timePercent,
          detailedDescription: item.detailedDescription,
          desiredOutput: item.desiredOutput,
          questions: item.questions,
        }))
      : undefined;

    const legacyAgenda = parsed.data.agenda?.trim() ?? "";
    const legacyTopics = parsed.data.topics ?? [];

    const synthesizedAgendaItems =
      agendaItems && agendaItems.length > 0
        ? agendaItems
        : [
            {
              id: "agenda-item-1",
              title: legacyTopics[0] ?? legacyAgenda,
              timePercent: 100,
              detailedDescription: legacyAgenda,
              desiredOutput: legacyAgenda,
              questions: legacyTopics.slice(1),
            },
          ];

    const synthesizedAgenda =
      legacyAgenda || synthesizedAgendaItems.map((item) => item.title).join(" | ") || "Shadow board agenda";
    const synthesizedTopics =
      legacyTopics.length > 0 ? legacyTopics : synthesizedAgendaItems.map((item) => item.title).filter(Boolean);

    const run = await startShadowBoardRunAsync({
      ...parsed.data,
      agenda: synthesizedAgenda,
      topics: synthesizedTopics,
      agendaItems: synthesizedAgendaItems,
    });
    return jsonCreated(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start shadow board run.";
    return jsonError(message, 500);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return jsonError("Invalid limit.", 400);
  }

  const runs = await listShadowBoardRuns(Math.min(limit, 500));
  return jsonOk({ runs });
}
