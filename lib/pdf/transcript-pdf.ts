interface TranscriptPdfInput {
  runId: string;
  agenda: string;
  topics: string[];
  transcriptLines: string[];
  generatedAtIso?: string;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const TOP_Y = 744;
const BOTTOM_Y = 56;
const LINE_HEIGHT = 14;
const MAX_CHARS_PER_LINE = 94;

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrapLine(input: string, maxChars = MAX_CHARS_PER_LINE): string[] {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) {
    return [""];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
      continue;
    }
    lines.push(word.slice(0, maxChars));
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function addTextLine(commands: string[], text: string, x: number, y: number, fontSize: number): void {
  commands.push("BT");
  commands.push(`/F1 ${fontSize} Tf`);
  commands.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
  commands.push(`(${escapePdfText(text)}) Tj`);
  commands.push("ET");
}

function buildPageStreams(lines: string[]): string[] {
  const pages: string[] = [];
  let commands: string[] = [];
  let y = TOP_Y;

  const startNewPage = () => {
    commands = [];
    y = TOP_Y;
  };

  const closePage = () => {
    pages.push(commands.join("\n"));
  };

  startNewPage();

  for (const line of lines) {
    const wrapped = wrapLine(line);
    for (const wrappedLine of wrapped) {
      if (y < BOTTOM_Y) {
        closePage();
        startNewPage();
      }
      addTextLine(commands, wrappedLine, MARGIN_X, y, 11);
      y -= LINE_HEIGHT;
    }
  }

  closePage();
  return pages;
}

function buildPdfDocument(pageStreams: string[]): Uint8Array {
  const objects: string[] = [];

  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;

  const contentObjectIds: number[] = [];
  const pageObjectIds: number[] = [];

  let nextId = 4;
  for (const stream of pageStreams) {
    const contentId = nextId++;
    const pageId = nextId++;
    contentObjectIds.push(contentId);
    pageObjectIds.push(pageId);

    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
  }

  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let id = 1; id < objects.length; id += 1) {
    const body = objects[id];
    if (!body) {
      continue;
    }
    offsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += `${id} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  const size = objects.length;
  pdf += `xref\n0 ${size}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id < size; id += 1) {
    const offset = offsets[id] ?? 0;
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function generateTranscriptPdf(input: TranscriptPdfInput): Uint8Array {
  const generatedAt = input.generatedAtIso ?? new Date().toISOString();
  const baseLines: string[] = [
    "Shadow Board Transcript Export",
    "",
    `Run ID: ${input.runId}`,
    `Generated: ${generatedAt}`,
    "",
    "Agenda",
    input.agenda || "n/a",
    "",
    "Topics",
    ...(input.topics.length > 0 ? input.topics.map((topic) => `- ${topic}`) : ["- n/a"]),
    "",
    "Full Transcript",
    ...(input.transcriptLines.length > 0 ? input.transcriptLines : ["No transcript lines available."]),
  ];

  const pageStreams = buildPageStreams(baseLines);
  return buildPdfDocument(pageStreams);
}
