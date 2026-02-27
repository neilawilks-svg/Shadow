import { describe, expect, it } from "vitest";

import { parseJsonFromText } from "@/lib/openai/json-parse";

describe("parseJsonFromText", () => {
  it("parses plain JSON", () => {
    expect(parseJsonFromText<{ a: number }>("{\"a\":1}")).toEqual({ a: 1 });
  });

  it("parses JSON inside markdown fence", () => {
    const raw = "Here you go:\n```json\n{\"name\":\"Morgan\",\"score\":9}\n```";
    expect(parseJsonFromText<{ name: string; score: number }>(raw)).toEqual({ name: "Morgan", score: 9 });
  });

  it("parses first balanced object from mixed text", () => {
    const raw = "Result: {\"ok\":true,\"items\":[1,2,3]} trailing notes";
    expect(parseJsonFromText<{ ok: boolean; items: number[] }>(raw)).toEqual({ ok: true, items: [1, 2, 3] });
  });

  it("returns null when no valid JSON is present", () => {
    expect(parseJsonFromText("no json here")).toBeNull();
  });
});
