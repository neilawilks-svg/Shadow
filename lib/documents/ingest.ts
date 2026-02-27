import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

import { upsertDocuments } from "@/lib/store/repository";
import type { DocumentRecord } from "@/types/domain";

const execFileAsync = promisify(execFile);

interface ScriptRecord {
  id: string;
  title: string;
  source_path: string;
  source_type: string;
  meeting_date?: string | null;
  people?: string[];
  tags?: string[];
  created_at: string;
  updated_at: string;
  confidentiality?: string;
  vault_path: string;
  summary?: string;
  chunk_ids?: string[];
}

interface ScriptManifest {
  generated_at: string;
  documents: ScriptRecord[];
}

const INGEST_SCRIPT = path.join(process.cwd(), "scripts", "ingest_board_docs.py");
const PROFILE_SCRIPT = path.join(process.cwd(), "scripts", "build_member_agent_profiles.py");
const VAULT_INDEX = path.join(process.cwd(), "local", "board-vault", "index.json");

function toRecord(item: ScriptRecord): DocumentRecord {
  const sourceType = item.source_type.toLowerCase();
  const normalizedType: DocumentRecord["sourceType"] =
    sourceType === "docx" ||
    sourceType === "pptx" ||
    sourceType === "pdf" ||
    sourceType === "md" ||
    sourceType === "txt" ||
    sourceType === "zip"
      ? sourceType
      : "other";

  return {
    id: item.id,
    title: item.title,
    sourcePath: item.source_path,
    sourceType: normalizedType,
    meetingDate: item.meeting_date ?? undefined,
    people: item.people ?? [],
    tags: item.tags ?? [],
    createdAt: item.created_at,
    updatedAt: item.updated_at ?? item.created_at,
    confidentiality: item.confidentiality === "internal" ? "internal" : "local_only",
    vaultPath: item.vault_path,
    summary: item.summary ?? "",
    chunkIds: item.chunk_ids ?? [],
  };
}

async function runIngestScript(args: string[]): Promise<ScriptManifest> {
  await execFileAsync("python3", [INGEST_SCRIPT, ...args], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  const rawManifest = await fs.readFile(VAULT_INDEX, "utf8");
  return JSON.parse(rawManifest) as ScriptManifest;
}

async function rebuildMemberAgentProfiles(force: boolean): Promise<void> {
  const args = [PROFILE_SCRIPT, "--vault-dir", path.join(process.cwd(), "local", "board-vault")];
  if (force) {
    args.push("--force");
  }

  await execFileAsync("python3", args, {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function bootstrapBoardDocuments(cleanupAi = false): Promise<DocumentRecord[]> {
  const args = ["--source-dir", path.join(process.cwd(), "new-files")];
  if (cleanupAi) {
    args.push("--cleanup-ai");
  }

  const manifest = await runIngestScript(args);
  await rebuildMemberAgentProfiles(true);
  const records = manifest.documents.map(toRecord);
  await upsertDocuments(records);
  return records;
}

export async function ingestSingleDocument(inputFilePath: string, cleanupAi = false): Promise<DocumentRecord[]> {
  const args = [
    "--source-dir",
    path.join(process.cwd(), "new-files"),
    "--input-file",
    inputFilePath,
  ];
  if (cleanupAi) {
    args.push("--cleanup-ai");
  }

  const manifest = await runIngestScript(args);
  await rebuildMemberAgentProfiles(true);
  const records = manifest.documents.map(toRecord);
  await upsertDocuments(records);
  return records;
}
