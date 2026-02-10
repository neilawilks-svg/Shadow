# API Surface

## Realtime
- `POST /api/realtime/client-secret`

## Meeting
- `POST /api/meeting/sessions`
- `POST /api/meeting/transcript-segments`
- `GET /api/meeting/events/:sessionId`
- `POST /api/meeting/invite-morgan`

## Personas
- `GET /api/personas`
- `POST /api/personas`
- `POST /api/personas/interview/start`
- `POST /api/personas/interview/:id/turn`

## Shadow Board
- `POST /api/shadow-board/runs`
- `GET /api/shadow-board/runs/:runId`
- `GET /api/shadow-board/runs/:runId/report`

## Observability + Demo
- `GET /api/observability/usage`
- `POST /api/demo/reset`
- `POST /api/demo/seed`
