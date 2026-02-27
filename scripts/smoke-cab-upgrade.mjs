import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const port = process.env.SMOKE_PORT ?? "3040";
const baseUrl = `http://127.0.0.1:${port}`;

let server;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const timeoutMs = 120000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready
    }
    await delay(1000);
  }
  throw new Error("Timed out waiting for Next.js server startup.");
}

async function getJson(pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "GET",
    ...init,
  });

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

async function patchJson(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`PATCH ${pathname} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function getText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${pathname} failed (${response.status}): ${body}`);
  }
  return body;
}

async function waitForShadowRun(runId, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await getJson(`/api/shadow-board/runs/${runId}`);
    if (run.status !== "running" && run.status !== "queued") {
      return run;
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for shadow run ${runId} to finish.`);
}

async function runSmoke() {
  console.log(`[smoke] starting next server on ${baseUrl}`);
  server = spawn("npm", ["run", "start", "--", "--port", port], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => {
    const text = String(chunk);
    if (text.includes("Ready") || text.includes("ready")) {
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

  console.log("[smoke] reset demo data");
  await postJson("/api/demo/reset", {});

  console.log("[smoke] bootstrap ingest from new-files");
  const bootstrap = await postJson("/api/documents/ingest/bootstrap", { cleanupAi: false });
  assert(typeof bootstrap.count === "number" && bootstrap.count > 0, "Expected bootstrap documents.");
  assert(
    existsSync(`${process.cwd()}/local/board-vault/agent-profiles.json`),
    "Expected generated agent profiles at local/board-vault/agent-profiles.json",
  );

  console.log("[smoke] list documents");
  const docsPayload = await getJson("/api/documents?limit=50");
  const documents = docsPayload.documents ?? [];
  assert(documents.length > 0, "Expected indexed documents.");

  console.log("[smoke] list personas");
  const personasPayload = await getJson("/api/personas");
  const speakingPersonaIds = (personasPayload.personas ?? [])
    .filter((persona) => persona.fixed)
    .map((persona) => persona.id)
    .filter((id) => !["dave-williams", "davi-quintiere"].includes(id));
  assert(speakingPersonaIds.length >= 9, "Expected speaking CAB roster.");
  const smokePersonaIds = speakingPersonaIds.slice(0, 5);
  assert(smokePersonaIds.length === 5, "Expected at least five speaking personas for smoke test.");

  console.log("[smoke] create meeting session");
  const session = await postJson("/api/meeting/sessions", {
    title: "Smoke CAB Session",
    consentAccepted: true,
  });
  assert(session.sessionId, "Expected session id.");

  console.log("[smoke] attach docs to session");
  const docIds = documents.slice(0, 3).map((doc) => doc.id);
  const patched = await patchJson(`/api/meeting/sessions/${session.sessionId}`, {
    documentIds: docIds,
  });
  assert((patched.session?.linkedDocumentIds ?? []).length >= 3, "Expected linked documents.");

  console.log("[smoke] append transcript segment");
  const segmentPayload = await postJson("/api/meeting/transcript-segments", {
    sessionId: session.sessionId,
    text: "Board chair: let's focus on pricing and risk for the March 4, 2026 London CAB agenda.",
    speaker: "chair",
    confidence: 0.93,
  });
  assert(segmentPayload.segment?.segmentId, "Expected transcript segment id.");

  console.log("[smoke] invite Morgan response + optional TTS");
  const invite = await postJson("/api/meeting/invite-morgan", {
    sessionId: session.sessionId,
    question: "What is the most important decision to lock before we leave the room?",
  });
  assert(typeof invite.response === "string" && invite.response.length > 0, "Expected Morgan response text.");

  console.log("[smoke] session detail fetch");
  const sessionDetail = await getJson(`/api/meeting/sessions/${session.sessionId}`);
  assert((sessionDetail.transcriptSegments ?? []).length >= 1, "Expected persisted transcript.");
  assert((sessionDetail.morganResponses ?? []).length >= 1, "Expected stored Morgan responses.");

  console.log("[smoke] export transcript formats");
  const exportMd = await getText(`/api/meeting/sessions/${session.sessionId}/export?format=md`);
  const exportJsonText = await getText(`/api/meeting/sessions/${session.sessionId}/export?format=json`);
  const exportSrt = await getText(`/api/meeting/sessions/${session.sessionId}/export?format=srt`);
  assert(exportMd.includes("Meeting Transcript"), "Expected markdown export body.");
  assert(exportJsonText.includes('"sessionId"'), "Expected JSON export body.");
  assert(exportSrt.includes("-->"), "Expected SRT export body.");

  console.log("[smoke] run shadow board with controls + docs");
  const run = await postJson("/api/shadow-board/runs", {
    agenda: "Prepare for March 4, 2026 London CAB discussion on AI commercialization.",
    topics: ["pricing", "risk", "operating model", "customer trust"],
    personaIds: smokePersonaIds,
    shadowSessionId: "smoke-shadow-session",
    meetingId: session.sessionId,
    documentIds: docIds,
    reasoningLevel: 8,
    maxConversationTurns: 5,
    randomness: 0.24,
    meetingArtifacts: ["Smoke artifact 1", "Smoke artifact 2"],
    transcriptSeed: ["Chair: Align on decision framework first."],
  });
  assert(run.runId, "Expected shadow board run id.");
  assert(run.status === "running", "Expected async-start run status.");
  assert(typeof run.controls?.reasoningLevel === "number", "Expected controls.reasoningLevel");
  assert(typeof run.controls?.maxConversationTurns === "number", "Expected controls.maxConversationTurns");
  assert(run.controls.maxConversationTurns >= 3, "Expected controls.maxConversationTurns >= 3");

  const completedRun = await waitForShadowRun(run.runId);
  assert(completedRun.status === "completed", `Expected completed shadow run, got ${completedRun.status}.`);
  assert(
    Array.isArray(completedRun.outputs) && completedRun.outputs.length >= 5,
    "Expected shadow board output per selected persona.",
  );
  const uniqueComments = new Set((completedRun.outputs ?? []).map((output) => String(output.comment ?? "").trim()));
  assert(uniqueComments.size >= 4, "Expected diversified persona comments across board members.");
  const duplicatePrefix = (completedRun.sharedTranscript ?? []).some((line) =>
    /^(?:\\[Turn\\s+\\d+\\]\\s+)?([^:]+):\\s+\\1:/i.test(line),
  );
  assert(!duplicatePrefix, "Expected transcript lines to avoid duplicated speaker prefixes.");

  console.log("[smoke] run report and list endpoints");
  const report = await getJson(`/api/shadow-board/runs/${run.runId}/report`);
  const runs = await getJson("/api/shadow-board/runs?limit=10");
  assert(typeof report.markdown === "string" && report.markdown.length > 0, "Expected report markdown.");
  assert((runs.runs ?? []).length >= 1, "Expected run list entries.");

  console.log("[smoke] close meeting session and verify history list");
  await postJson(`/api/meeting/sessions/${session.sessionId}/end`, {});
  const sessions = await getJson("/api/meeting/sessions?limit=10");
  assert((sessions.sessions ?? []).length >= 1, "Expected meeting history rows.");

  console.log("[smoke] all functionality checks passed");
}

async function shutdown(code) {
  if (server && !server.killed) {
    server.kill("SIGINT");
    await delay(700);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
  process.exit(code);
}

runSmoke()
  .then(() => shutdown(0))
  .catch((error) => {
    console.error("[smoke] failed", error instanceof Error ? error.message : error);
    shutdown(1);
  });
