# Architecture Overview

## Runtime Topology
- Next.js App Router for UI and backend route handlers.
- Browser captures selected audio input device and streams audio frames for transcription.
- Backend routes manage OpenAI token minting, meeting/session state, personas, and shadow board orchestration.
- Local JSON storage under `/data` provides local-first persistence.

## Key Flows
1. Meeting capture flow
   - `/api/meeting/sessions` creates a consent-gated session.
   - `/api/realtime/client-secret` mints ephemeral token for realtime transcription session init.
   - Transcript segments are posted to `/api/meeting/transcript-segments`.
   - Monitor agent evaluates rolling context and publishes hand-raise events to SSE stream.
2. Persona interview flow
   - `/api/personas/interview/start` opens guided interview session.
   - `/api/personas/interview/:id/turn` appends answer and synthesizes draft persona profile.
   - `/api/personas` persists custom persona.
3. Shadow board flow
   - `/api/shadow-board/runs` executes multi-persona simulation.
   - `/api/shadow-board/runs/:runId` returns run output.
   - `/api/shadow-board/runs/:runId/report` emits Markdown report.

## Governance Defaults
- Consent required before capture starts.
- Redaction on persisted transcript text by default.
- Raw audio persistence disabled.
