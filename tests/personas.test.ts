import { describe, expect, it } from "vitest";

import { FIXED_PERSONAS } from "@/lib/store/default-personas";

describe("fixed personas", () => {
  it("includes eight default personas", () => {
    expect(FIXED_PERSONAS).toHaveLength(8);
  });
});
