import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { ingestSingleDocument } from "@/lib/documents/ingest";
import { jsonCreated, jsonError } from "@/lib/http";

const UPLOAD_DIR = process.env.MORGAN_UPLOAD_DIR?.trim() || path.join("/tmp", "morgan-uploads");

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return jsonError("Invalid multipart upload payload.", 400);
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("Expected `file` in upload payload.", 400);
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const fileName = `${Date.now()}-${randomUUID()}-${file.name}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, bytes);

    const cleanupAi = String(formData.get("cleanupAi") ?? "false") === "true";
    const records = await ingestSingleDocument(filePath, cleanupAi);

    return jsonCreated({
      filePath,
      count: records.length,
      documents: records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed due to server error.";
    return jsonError(message, 500);
  }
}
