interface PersonaSummary {
  id: string;
  name: string;
  lens?: string;
  paceIncentive?: "accelerate" | "balanced" | "deliberate";
}

function sentence(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "";
  }
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

export function buildPersonaNeutralPlaceholders(params: {
  persona: PersonaSummary;
  existingComment?: string;
  thinkingSteps?: string[];
}): string[] {
  const personaName = params.persona.name;
  const lens = params.persona.lens?.toLowerCase() || "board";
  const paceLine =
    params.persona.paceIncentive === "accelerate"
      ? "I want a shorter path from discussion to pilot execution with explicit milestone checks"
      : params.persona.paceIncentive === "deliberate"
        ? "I want stronger validation before full rollout and a staged checkpoint plan"
        : "I want speed and control to stay balanced through one clear checkpoint";

  const firstThinking = params.thinkingSteps?.find((item) => item.trim().length > 0) ?? "Pressure-test one high-impact assumption";

  const seed: string[] = [];
  if (params.existingComment && params.existingComment.trim()) {
    const cleaned = params.existingComment.replace(new RegExp(`^${personaName}:\\s*`, "i"), "").trim();
    if (cleaned) {
      seed.push(`${personaName}: ${sentence(cleaned)}`);
    }
  }

  seed.push(`${personaName}: From my ${lens} lens, we should define the decision criteria and ownership before we commit.`);
  seed.push(`${personaName}: ${sentence(paceLine)}`);
  seed.push(`${personaName}: ${sentence(firstThinking)}`);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of seed) {
    const normalized = line.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(line);
    if (deduped.length >= 5) {
      break;
    }
  }

  return deduped;
}
