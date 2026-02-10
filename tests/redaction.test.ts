import { describe, expect, it } from "vitest";

import { redactSensitiveText } from "@/lib/redaction/redact";

describe("redaction", () => {
  it("redacts email and phone patterns", () => {
    const input = "Contact jane.doe@example.com or 555-123-4567 for details.";
    const result = redactSensitiveText(input);

    expect(result.redactedText).toContain("[REDACTED_EMAIL]");
    expect(result.redactedText).toContain("[REDACTED_PHONE]");
    expect(result.findings).toContain("email");
    expect(result.findings).toContain("phone");
  });
});
