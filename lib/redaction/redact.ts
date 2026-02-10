import { config } from "@/lib/config";

interface RedactionResult {
  redactedText: string;
  findings: string[];
  redactionApplied: boolean;
}

const patterns: Array<{ label: string; regex: RegExp; replacement: string }> = [
  {
    label: "email",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    label: "phone",
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    label: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },
  {
    label: "account",
    regex: /\b(?:account|acct)\s*(?:number|#)?\s*[:=-]?\s*[0-9]{6,}\b/gi,
    replacement: "[REDACTED_ACCOUNT]",
  },
];

export function redactSensitiveText(input: string): RedactionResult {
  if (!config.enableRedaction) {
    return {
      redactedText: input,
      findings: [],
      redactionApplied: false,
    };
  }

  let next = input;
  const findings: string[] = [];

  for (const pattern of patterns) {
    if (pattern.regex.test(next)) {
      findings.push(pattern.label);
      next = next.replace(pattern.regex, pattern.replacement);
    }
  }

  return {
    redactedText: next,
    findings,
    redactionApplied: findings.length > 0,
  };
}
