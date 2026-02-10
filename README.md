# Morgan Virtual Board Member Demo

Local-first OpenAI-powered demo for:
- Live board meeting listening + transcript timeline
- Morgan raise-hand insight queue
- Persona studio with guided interview synthesis
- 8-agent shadow board simulation and report generation
- 8-bit virtual board roam with persona thought bubbles

## Tech Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- OpenAI API + Agents SDK
- Local JSON persistence under `/data`

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
- `PERSIST_TRANSCRIPTS`
- `PERSIST_RAW_AUDIO`
- `ENABLE_REDACTION`

## Run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Routes
- `/meeting`
- `/personas`
- `/shadow-board`
- `/demo`

## Key APIs
- `POST /api/realtime/client-secret`
- `POST /api/meeting/sessions`
- `POST /api/meeting/transcript-segments`
- `GET /api/meeting/events/:sessionId`
- `POST /api/meeting/invite-morgan`
- `GET/POST /api/personas`
- `POST /api/personas/interview/start`
- `POST /api/personas/interview/:id/turn`
- `POST /api/shadow-board/runs`
- `GET /api/shadow-board/runs/:runId`
- `GET /api/shadow-board/runs/:runId/report`

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
- `docs/runbooks/demo-script.md`
- `docs/worktrees.md`
