function tryParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractFromCodeFences(text: string): string[] {
  const matches: string[] = [];
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(regex)) {
    const block = match[1]?.trim();
    if (block) {
      matches.push(block);
    }
  }
  return matches;
}

function extractBalancedCandidate(text: string, openChar: string, closeChar: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== openChar) {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === "\\") {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === openChar) {
        depth += 1;
        continue;
      }

      if (char === closeChar) {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1).trim();
          if (candidate) {
            candidates.push(candidate);
          }
          break;
        }
      }
    }
  }

  return candidates;
}

export function parseJsonFromText<T>(raw: string): T | null {
  const direct = tryParse<T>(raw.trim());
  if (direct !== null) {
    return direct;
  }

  const fenceCandidates = extractFromCodeFences(raw);
  for (const candidate of fenceCandidates) {
    const parsed = tryParse<T>(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const candidate of extractBalancedCandidate(raw, "{", "}")) {
    const parsed = tryParse<T>(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const candidate of extractBalancedCandidate(raw, "[", "]")) {
    const parsed = tryParse<T>(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}
