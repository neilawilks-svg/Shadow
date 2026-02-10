import { PersonasClientPage } from "@/components/personas-client";
import { getPersonas } from "@/lib/store/repository";

export default async function PersonasPage() {
  const personas = await getPersonas();
  return <PersonasClientPage initialPersonas={personas} />;
}
