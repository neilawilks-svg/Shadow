import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const port = process.env.DEMO_PORT ?? "3020";
const baseUrl = `http://localhost:${port}`;

let server;

async function main() {
  console.log(`Starting dev server on port ${port}...`);
  server = spawn("npm", ["run", "dev", "--", "--port", port], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  server.stdout.on("data", (chunk) => {
    const text = String(chunk);
    if (text.includes("Ready")) {
      process.stdout.write(text);
    }
  });

  server.stderr.on("data", (chunk) => {
    const text = String(chunk);
    if (text.trim()) {
      process.stderr.write(text);
    }
  });

  await waitForServer();

  await postJson("/api/demo/reset", {});
  await postJson("/api/demo/seed", {});

  const personasPayload = await getJson("/api/personas");
  const personaIds = (personasPayload.personas ?? [])
    .filter((persona) => persona.fixed)
    .filter((persona) => !["dave-williams", "davi-quintiere"].includes(persona.id))
    .map((persona) => persona.id);

  if (personaIds.length < 9) {
    throw new Error("Expected CAB speaking roster for demo-ready initialization.");
  }

  const run = await postJson("/api/shadow-board/runs", {
    agenda:
      "Validate launch strategy for an OpenAI-powered virtual board advisory offer across regulated and growth markets.",
    topics: [
      "go-to-market differentiation",
      "governance and safety controls",
      "operating model readiness",
      "ROI and scaling checkpoints",
    ],
    personaIds,
  });

  if (!run?.runId) {
    throw new Error("Shadow board run did not return runId.");
  }

  const report = await getJson(`/api/shadow-board/runs/${run.runId}/report`);

  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(
    path.join(root, "data", "demo-ready-shadow-board-report.md"),
    report.markdown ?? "No report markdown returned.\n",
    "utf8",
  );

  console.log("Demo bootstrap complete.");
  console.log(`Shadow board run: ${run.runId}`);
  console.log("Saved report: data/demo-ready-shadow-board-report.md");
}

async function waitForServer() {
  const timeoutMs = 90000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }
    await delay(1000);
  }

  throw new Error("Timed out waiting for dev server startup.");
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { method: "GET" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GET ${pathname} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function postJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`POST ${pathname} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(exitCode = 0) {
  if (server && !server.killed) {
    server.kill("SIGINT");
    await delay(800);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
  process.exit(exitCode);
}

main()
  .then(() => shutdown(0))
  .catch((error) => {
    console.error("demo:ready failed", error instanceof Error ? error.message : error);
    shutdown(1);
  });
