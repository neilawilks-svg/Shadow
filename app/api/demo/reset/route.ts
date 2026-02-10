import { jsonOk } from "@/lib/http";
import { resetDemoData } from "@/lib/store/admin";

export async function POST() {
  await resetDemoData();
  return jsonOk({ ok: true });
}
