import { describe, expect, it } from "vitest";
import { isValidBasicAuth, parseBasicAuthorizationHeader } from "@/lib/security/basic-auth";

describe("basic auth helpers", () => {
  it("parses valid header", () => {
    const header = `Basic ${Buffer.from("demo:secret").toString("base64")}`;
    expect(parseBasicAuthorizationHeader(header)).toEqual({ username: "demo", password: "secret" });
  });

  it("rejects missing/invalid header", () => {
    expect(parseBasicAuthorizationHeader(null)).toBeNull();
    expect(parseBasicAuthorizationHeader("Bearer token")).toBeNull();
  });

  it("validates expected credentials", () => {
    const good = `Basic ${Buffer.from("demo:secret").toString("base64")}`;
    const bad = `Basic ${Buffer.from("demo:wrong").toString("base64")}`;
    expect(
      isValidBasicAuth({ authorizationHeader: good, expectedUsername: "demo", expectedPassword: "secret" }),
    ).toBe(true);
    expect(
      isValidBasicAuth({ authorizationHeader: bad, expectedUsername: "demo", expectedPassword: "secret" }),
    ).toBe(false);
  });
});
