export function stripSpeakerPrefix(text: string, speakerName: string): string {
  const cleanedText = text.trim();
  const escapedName = speakerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedName}:\\s*`, "i");
  return cleanedText.replace(pattern, "").trim();
}

export function formatSpeakerTranscriptLine(speakerName: string, text: string): string {
  const body = stripSpeakerPrefix(text, speakerName);
  return `${speakerName}: ${body}`.trim();
}

export function parseShadowTranscriptTurn(line: string): { speaker: string; text: string } | null {
  if (!line || !line.trim()) {
    return null;
  }

  let cleaned = line.trim();
  cleaned = cleaned.replace(/^\[Turn\s+\d+\]\s*/i, "").trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const header = lines[0] ?? "";
  const separatorIndex = header.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const speaker = header.slice(0, separatorIndex).trim();
  const firstLineBody = header.slice(separatorIndex + 1).trim();
  const trailingBody = lines.slice(1).join(" ").trim();
  const text = [firstLineBody, trailingBody].filter(Boolean).join(" ").trim();
  if (!speaker || !text) {
    return null;
  }

  return {
    speaker,
    text,
  };
}
