import path from "node:path";
import { promises as fs } from "node:fs";

import { NextResponse } from "next/server";

const ALLOWED_FILES = new Set([
  "anthony-battle-executive-persona-profile.pdf",
  "constantin-beier-executive-persona-profile.pdf",
  "dave-williams-executive-persona-profile.pdf",
  "davi-quintiere-executive-persona-profile.pdf",
  "dean-curtis-executive-persona-profile.pdf",
  "gabi-wagenhofer-executive-persona-profile.pdf",
  "karan-khanna-executive-persona-profile.pdf",
  "marco-van-den-berg-executive-persona-profile.pdf",
  "morgan-executive-persona-profile.pdf",
  "sophie-bailes-executive-persona-profile.pdf",
  "vivek-ganotra-executive-persona-profile.pdf",
]);

export async function GET(_: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await params;

  if (!ALLOWED_FILES.has(fileName)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "persona-docs", fileName);

  try {
    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
