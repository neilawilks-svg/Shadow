import path from "node:path";
import { jsonCreated, jsonError } from "@/lib/http";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return jsonError("Invalid multipart upload payload.", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("Expected `file` in upload payload.", 400);
  }
  if (file.size <= 0) {
    return jsonError("Uploaded file is empty.", 400);
  }
  if (file.size > MAX_PDF_BYTES) {
    return jsonError("Persona PDF exceeds 20MB limit.", 400);
  }

  const extension = path.extname(file.name).toLowerCase();
  if (file.type !== "application/pdf" && extension !== ".pdf") {
    return jsonError("Only PDF files are supported.", 400);
  }

  const personaId = String(formData.get("personaId") ?? "pending").trim().toLowerCase().slice(0, 80) || "pending";
  const timestamp = Date.now();
  const sanitizedFileName = sanitizeFileName(file.name || "persona.pdf") || "persona.pdf";
  const blobPath = `persona-pdfs/${personaId}/${timestamp}-${sanitizedFileName}`;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  if (!blobToken) {
    return jsonError("Missing BLOB_READ_WRITE_TOKEN for persona PDF upload.", 500);
  }

  try {
    const uploadUrl = `https://blob.vercel-storage.com/${blobPath}?access=public&addRandomSuffix=0`;

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${blobToken}`,
        "Content-Type": "application/pdf",
      },
      body: await file.arrayBuffer(),
    });
    if (!response.ok) {
      return jsonError("Persona PDF upload failed.", 500);
    }
    const uploaded = (await response.json().catch(() => null)) as
      | {
          url?: string;
          pathname?: string;
        }
      | null;
    if (!uploaded?.url || !uploaded?.pathname) {
      return jsonError("Persona PDF upload failed.", 500);
    }

    return jsonCreated({
      url: uploaded.url,
      pathname: uploaded.pathname,
      fileName: sanitizedFileName,
      size: file.size,
      contentType: "application/pdf",
    });
  } catch {
    return jsonError("Persona PDF upload failed. Check Vercel Blob configuration.", 500);
  }
}
