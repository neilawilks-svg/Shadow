import { describe, expect, it } from "vitest";

import { FIXED_PERSONAS } from "@/lib/store/default-personas";

describe("fixed personas", () => {
  it("includes CAB speaking roster + facilitator context personas", () => {
    expect(FIXED_PERSONAS.length).toBeGreaterThanOrEqual(11);
    const ids = FIXED_PERSONAS.map((persona) => persona.id);
    expect(ids).toContain("morgan-core");
    expect(ids).toContain("anthony-battle");
    expect(ids).toContain("constantin-beier");
    expect(ids).toContain("dean-curtis");
    expect(ids).toContain("gabi-wagenhofer");
    expect(ids).toContain("karan-khanna");
    expect(ids).toContain("marco-van-den-berg");
    expect(ids).toContain("sophie-bailes");
    expect(ids).toContain("vivek-ganotra");
    expect(ids).toContain("dave-williams");
    expect(ids).toContain("davi-quintiere");
  });

  it("includes mixed pacing incentives for realistic consensus tension", () => {
    const paces = FIXED_PERSONAS.map((persona) => persona.paceIncentive);
    expect(paces).toContain("accelerate");
    expect(paces).toContain("deliberate");
    expect(paces).toContain("balanced");
  });
});
