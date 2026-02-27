import { ShadowBoardClientPage } from "@/components/shadow-board-client";
import { getPersonas } from "@/lib/store/repository";

export default async function ShadowBoardPage() {
  const personas = await getPersonas();
  return <ShadowBoardClientPage initialPersonas={personas} />;
}
