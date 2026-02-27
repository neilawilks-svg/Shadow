import { writeJsonFile } from "@/lib/store/file-store";
import { FIXED_PERSONAS } from "@/lib/store/default-personas";
import type { PersonaProfile } from "@/types/domain";

export async function resetDemoData(): Promise<void> {
  await writeJsonFile<PersonaProfile[]>("personas.json", FIXED_PERSONAS);
  await writeJsonFile("meeting-sessions.json", []);
  await writeJsonFile("transcript-segments.json", []);
  await writeJsonFile("hand-raise-events.json", []);
  await writeJsonFile("persona-interviews.json", []);
  await writeJsonFile("shadow-board-runs.json", []);
  await writeJsonFile("shadow-board-events.json", []);
  await writeJsonFile("usage-metrics.json", []);
  await writeJsonFile("documents.json", []);
}

export async function seedDemoData(): Promise<void> {
  await writeJsonFile("personas.json", FIXED_PERSONAS);
}
