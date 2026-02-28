import { describe, expect, it } from "vitest";

import { allocateTurnsForAgendaItems, buildAgendaTurnSchedule } from "@/lib/agents/shadow-board";

describe("agenda turn allocation", () => {
  it("allocates turns proportionally and sums to max turns", () => {
    const allocated = allocateTurnsForAgendaItems(24, [
      { id: "a", title: "A", timePercent: 50, desiredOutput: "", questions: [], plannedTurns: 0 },
      { id: "b", title: "B", timePercent: 30, desiredOutput: "", questions: [], plannedTurns: 0 },
      { id: "c", title: "C", timePercent: 20, desiredOutput: "", questions: [], plannedTurns: 0 },
    ]);

    expect(allocated.map((item) => item.plannedTurns)).toEqual([12, 7, 5]);
    expect(allocated.reduce((sum, item) => sum + item.plannedTurns, 0)).toBe(24);
  });

  it("gives each item at least one turn when feasible", () => {
    const allocated = allocateTurnsForAgendaItems(6, [
      { id: "a", title: "A", timePercent: 90, desiredOutput: "", questions: [], plannedTurns: 0 },
      { id: "b", title: "B", timePercent: 5, desiredOutput: "", questions: [], plannedTurns: 0 },
      { id: "c", title: "C", timePercent: 5, desiredOutput: "", questions: [], plannedTurns: 0 },
    ]);

    expect(allocated.every((item) => item.plannedTurns >= 1)).toBe(true);
    expect(allocated.reduce((sum, item) => sum + item.plannedTurns, 0)).toBe(6);
  });

  it("builds a schedule matching max turns", () => {
    const allocated = allocateTurnsForAgendaItems(10, [
      { id: "a", title: "A", timePercent: 70, desiredOutput: "", questions: [], plannedTurns: 0 },
      { id: "b", title: "B", timePercent: 30, desiredOutput: "", questions: [], plannedTurns: 0 },
    ]);
    const schedule = buildAgendaTurnSchedule(allocated, 10);
    expect(schedule).toHaveLength(10);
    expect(schedule.filter((item) => item.id === "a").length).toBeGreaterThan(schedule.filter((item) => item.id === "b").length);
  });
});
