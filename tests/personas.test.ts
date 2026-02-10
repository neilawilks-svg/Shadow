import { describe, expect, it } from "vitest";

import { FIXED_PERSONAS } from "@/lib/store/default-personas";

describe("fixed personas", () => {
  it("includes eight default personas", () => {
    expect(FIXED_PERSONAS).toHaveLength(8);
  });

  it("includes mixed pacing incentives for realistic consensus tension", () => {
    const paces = FIXED_PERSONAS.map((persona) => persona.paceIncentive);
    expect(paces).toContain("accelerate");
    expect(paces).toContain("deliberate");
    expect(paces).toContain("balanced");
  });
});
