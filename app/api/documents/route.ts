import { jsonError, jsonOk } from "@/lib/http";
import { listDocuments } from "@/lib/store/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 200;
  if (!Number.isFinite(limit) || limit <= 0) {
    return jsonError("Invalid limit.", 400);
  }

  const documents = await listDocuments(Math.min(limit, 1000));
  return jsonOk({ documents });
}
