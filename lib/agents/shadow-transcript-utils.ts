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
  const turnMatch = cleaned.match(/^\[Turn\s+\d+\]\s+(.*)$/i);
  if (turnMatch) {
    cleaned = turnMatch[1]?.trim() ?? "";
  }

  const separatorIndex = cleaned.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const speaker = cleaned.slice(0, separatorIndex).trim();
  const text = cleaned.slice(separatorIndex + 1).trim();
  if (!speaker || !text) {
    return null;
  }

  return {
    speaker,
    text,
  };
}
