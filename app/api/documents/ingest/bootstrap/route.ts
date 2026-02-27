import { z } from "zod";

import { bootstrapBoardDocuments } from "@/lib/documents/ingest";
import { jsonCreated, jsonError } from "@/lib/http";

const schema = z
  .object({
    cleanupAi: z.boolean().optional().default(false),
  })
  .optional();

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("Invalid bootstrap ingest payload.", 400, parsed.error.flatten());
  }

  const records = await bootstrapBoardDocuments(parsed.data?.cleanupAi ?? false);
  return jsonCreated({
    count: records.length,
    documents: records,
  });
}
