import { promises as fs } from "node:fs";
import path from "node:path";

const PRIMARY_DATA_DIR = path.join(process.cwd(), "data");
const EPHEMERAL_DATA_DIR = path.join("/tmp", "morgan-data");

function getDataDirectories(): string[] {
  const configured = (process.env.MORGAN_DATA_DIR ?? "").trim();
  const dirs = [configured, PRIMARY_DATA_DIR, EPHEMERAL_DATA_DIR].filter(Boolean);
  return Array.from(new Set(dirs));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && "code" in value;
}

async function ensureDataDir(): Promise<void> {
  const candidates = getDataDirectories();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to initialize data directory.");
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  for (const dataDir of getDataDirectories()) {
    const filePath = path.join(dataDir, fileName);
    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }
    }
  }

  try {
    await writeJsonFile(fileName, fallback);
  } catch {
    // Hosted runtimes can be read-only; fallback can still be used in-memory.
  }

  return fallback;
}

export async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  await ensureDataDir();
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  let lastError: unknown = null;

  for (const dataDir of getDataDirectories()) {
    const filePath = path.join(dataDir, fileName);
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(filePath, serialized, "utf8");
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to persist data.");
}
