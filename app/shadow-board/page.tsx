import { ShadowBoardClientPage } from "@/components/shadow-board-client";
import { getPersonas } from "@/lib/store/repository";

export default async function ShadowBoardPage() {
  const personas = await getPersonas();
  const fixed = personas.filter((persona) => persona.fixed).slice(0, 8);
  return <ShadowBoardClientPage initialPersonas={fixed} />;
}
