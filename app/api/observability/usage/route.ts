import { jsonOk } from "@/lib/http";
import { getUsageSummary } from "@/lib/store/repository";

export async function GET() {
  const summary = await getUsageSummary();
  return jsonOk(summary);
}
