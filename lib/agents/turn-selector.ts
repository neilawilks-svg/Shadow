import type { BoardTurnBid } from "@/types/domain";

export interface TurnSelectorState {
  turnCounts: Map<string, number>;
  lastSpokenAt: Map<string, number>;
  turnIndex: number;
}

export function selectNextSpeakerBid(bids: BoardTurnBid[], state: TurnSelectorState): BoardTurnBid | null {
  const eligible = bids.filter((bid) => bid.shouldSpeak);
  const fallbackPool = eligible.length > 0 ? eligible : bids;
  if (fallbackPool.length === 0) {
    return null;
  }

  const turnCounts = fallbackPool.map((bid) => state.turnCounts.get(bid.personaId) ?? 0);
  const minTurns = turnCounts.length > 0 ? Math.min(...turnCounts) : 0;

  const score = (bid: BoardTurnBid): number => {
    const count = state.turnCounts.get(bid.personaId) ?? 0;
    const lastSpoken = state.lastSpokenAt.get(bid.personaId);
    const idleTurns = lastSpoken === undefined ? state.turnIndex + 1 : state.turnIndex - lastSpoken;
    const fairnessFromCount = count <= minTurns ? 0.35 : Math.max(0.05, 0.35 - (count - minTurns) * 0.08);
    const fairnessFromIdle = Math.min(1.05, Math.max(0, idleTurns) * 0.08);
    return bid.urgency_1_to_10 + fairnessFromCount + fairnessFromIdle;
  };

  const ranked = [...fallbackPool].sort((a, b) => {
    const scoreA = score(a);
    const scoreB = score(b);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    if (b.urgency_1_to_10 !== a.urgency_1_to_10) {
      return b.urgency_1_to_10 - a.urgency_1_to_10;
    }

    const lastA = state.lastSpokenAt.get(a.personaId);
    const lastB = state.lastSpokenAt.get(b.personaId);
    const sinceA = lastA === undefined ? Number.POSITIVE_INFINITY : state.turnIndex - lastA;
    const sinceB = lastB === undefined ? Number.POSITIVE_INFINITY : state.turnIndex - lastB;
    if (sinceB !== sinceA) {
      return sinceB - sinceA;
    }

    const countA = state.turnCounts.get(a.personaId) ?? 0;
    const countB = state.turnCounts.get(b.personaId) ?? 0;
    if (countA !== countB) {
      return countA - countB;
    }

    return a.personaId.localeCompare(b.personaId);
  });

  return ranked[0] ?? null;
}
