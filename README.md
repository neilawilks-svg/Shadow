# Morgan Virtual Board Member Demo

Local-first OpenAI-powered demo for:
- Live board meeting listening + transcript timeline
- Morgan raise-hand insight queue
- Session history retrieval + transcript export (`md`, `json`, `srt`)
- Morgan response audio clips with autoplay + replay
- Persona studio with guided interview synthesis
- CAB roster shadow board simulation with deterministic turn selection
- Local vault + local MCP RAG retrieval over board artifacts
- 8-bit virtual board roam with persona thought bubbles

## Tech Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- OpenAI API + Agents SDK
- Local JSON persistence under `/data` and local artifacts under `/local`

## Prerequisites
- Node.js 22+
- npm
- OpenAI API key in `.env`

## Environment
`.env` and `.env.example` include:
- `OPENAI_API_KEY`
- `MODEL_TRANSCRIBE`
- `MODEL_MONITOR`
- `MODEL_PERSONA_SYNTHESIS`
- `MODEL_SHADOW_BOARD`
- `MODEL_TEXT_TO_SPEECH`
- `BOARD_AGENT_VOICE`
- `TRACE_EXPORT_ENABLED`
- `OPENAI_TRACING_PROJECT`
- `OPENAI_TRACING_ORGANIZATION`
- `OPENAI_TRACING_ENDPOINT`
- `BLOB_READ_WRITE_TOKEN` (required for persona PDF upload persistence)
- `PERSIST_TRANSCRIPTS`
- `PERSIST_RAW_AUDIO`
- `ENABLE_REDACTION`
- `DEMO_USERNAME` (optional: enables staging auth gate when set with password)
- `DEMO_PASSWORD` (optional: enables staging auth gate when set with username)

## Run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## First-Run Checklist
1. Add `OPENAI_API_KEY` in `.env`.
2. Install dependencies: `npm install`.
3. Bootstrap demo state and pre-run sample shadow board:
```bash
npm run demo:ready
```
4. Start app: `npm run dev`.
5. Open `/demo` and run **Demo Health** checks.
6. Open `/meeting`, select system audio input (`BlackHole 2ch` or `Microsoft Teams Audio`), accept consent, and start capture.
7. Open `/shadow-board`, bootstrap/ingest docs, then run CAB roster simulation.

## Routes
- `/meeting`
- `/personas`
- `/shadow-board`
- `/demo`

## Key APIs
- `POST /api/realtime/client-secret`
- `GET/POST /api/meeting/sessions`
- `GET/PATCH /api/meeting/sessions/:sessionId`
- `POST /api/meeting/sessions/:sessionId/end`
- `GET /api/meeting/sessions/:sessionId/export?format=md|json|srt`
- `GET /api/meeting/audio/:fileName`
- `POST /api/meeting/transcript-segments`
- `GET /api/meeting/events/:sessionId`
- `POST /api/meeting/invite-morgan`
- `GET /api/documents`
- `POST /api/documents/ingest/bootstrap`
- `POST /api/documents/upload`
- `GET/POST /api/personas`
- `POST /api/personas/interview/start`
- `POST /api/personas/interview/:id/turn`
- `GET/POST /api/shadow-board/runs`
- `GET /api/shadow-board/runs/:runId`
- `GET /api/shadow-board/runs/:runId/report`
- `GET /api/demo/health`

## Governance Defaults
- Consent required before capture.
- Redaction enabled by default.
- Raw audio persistence disabled.

## Industry Sample Packets
- `data/industry-agenda-packets/healthcare-provider-openai-shadow-board.md`
- `data/industry-agenda-packets/financial-services-openai-shadow-board.md`
- `data/industry-agenda-packets/retail-commerce-openai-shadow-board.md`

## Innovation Persona Seed
- `data/sample-interview-openai-innovation-board-member.md`

## Docs
- `docs/requirements/morgan-phase-brief.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/agents-sdk-traces.md`
- `docs/runbooks/demo-script.md`
- `docs/runbooks/staging-demo-deploy.md`
- `docs/worktrees.md`

## Handoff Docs
- `docs/reviewer-handoff.md`
- `docs/install-codex-windows-vscode-and-macos-app.md`
- `docs/share-archive-procedure.md`

## Validation Commands
```bash
npm run lint
npm run test
npm run build
npm run smoke:cab
.venv/bin/python -m pytest tests_py -q
```
