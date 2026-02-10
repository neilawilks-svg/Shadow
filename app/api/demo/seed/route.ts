import { jsonOk } from "@/lib/http";
import { seedDemoData } from "@/lib/store/admin";

export async function POST() {
  await seedDemoData();
  return jsonOk({ ok: true });
}
