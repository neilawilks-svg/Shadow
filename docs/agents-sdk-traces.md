# Morgan CAB Upgrade: Agents SDK + MCP RAG + Traces

## Agents SDK Workflows

The orchestration path now runs through `@openai/agents` with redacted tracing.

- Runtime bootstrap: `lib/agents/runtime.ts`
- Workflow handlers:
  - `meeting_monitor` (`lib/agents/monitor.ts`)
  - `invite_morgan` (`lib/agents/invite-morgan.ts`)
  - `persona_synthesis` (`lib/agents/persona-interview.ts`)
  - `shadow_board_round` (`lib/agents/shadow-board.ts`)

### Trace Policy

- `traceIncludeSensitiveData: false`
- Grouping:
  - Meeting workflows grouped by `groupId=sessionId`
  - Shadow board workflows grouped by `groupId=runId`

### Trace Env

Configured in `lib/config.ts` and `.env.example`:

- `TRACE_EXPORT_ENABLED`
- `OPENAI_TRACING_PROJECT`
- `OPENAI_TRACING_ORGANIZATION`
- `OPENAI_TRACING_ENDPOINT`

## Local RAG MCP Tooling

A local MCP server exposes the RAG index built from `new-files/` artifacts.

- MCP server: `scripts/mcp/local_rag_server.mjs`
- App connector: `lib/agents/mcp-rag.ts`

### MCP Tools

- `rag.search`
- `rag.get_chunk`
- `rag.list_documents`
- `rag.get_document`

All tool outputs include chunk/document metadata (`doc_id`, `chunk_id`, `score`, `text`, `source_path`, `tags`, `meeting_date`) where applicable.

## Local Intake and Vault Pipeline

- Ingestion entry point: `scripts/ingest_board_docs.py`
- Converters:
  - `scripts/converters/docx_to_md.py`
  - `scripts/converters/pptx_to_md.py`
  - `scripts/converters/pdf_to_md.py`

### Output Structure

- `local/board-vault/people/*.md`
- `local/board-vault/meetings/*.md`
- `local/board-vault/briefs/*.md`
- `local/board-vault/index.json`
- `local/rag-store/chunks.jsonl`
- `local/rag-store/index.json`

## Session Memory and Exports

Session persistence and retrieval are handled in `lib/store/repository.ts`.

- Session history APIs:
  - `GET /api/meeting/sessions`
  - `GET /api/meeting/sessions/:sessionId`
  - `POST /api/meeting/sessions/:sessionId/end`
- Transcript export:
  - `GET /api/meeting/sessions/:sessionId/export?format=md|json|srt`
- Audio playback endpoint:
  - `GET /api/meeting/audio/:fileName`

## Morgan TTS

- TTS helper: `lib/audio/tts.ts`
- Env config:
  - `MODEL_TEXT_TO_SPEECH`
  - `BOARD_AGENT_VOICE`
- Storage: `local/audio-clips/`
- UI exposes autoplay and manual replay in meeting timeline.

## Verification

- TypeScript tests: `npm run test`
- Build/typecheck: `npm run build`
- Lint: `npm run lint`
- Python tests (local venv): `.venv/bin/python -m pytest tests_py -q`
