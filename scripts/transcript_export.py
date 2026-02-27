#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Iterable, List, Mapping


def _parse_iso(value: str) -> datetime:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    parsed = datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_srt_time(value: datetime) -> str:
    hours = value.hour
    minutes = value.minute
    seconds = value.second
    millis = value.microsecond // 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def _clean_text(value: str) -> str:
    return " ".join(value.replace("\r", "\n").split())


def export_markdown(session_id: str, segments: Iterable[Mapping[str, object]], generated_at: str | None = None) -> str:
    stamp = generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    lines: List[str] = [f"# Meeting Transcript ({session_id})", "", f"Generated at: {stamp}", "", "## Segments"]

    for segment in segments:
        ended_at = str(segment.get("endedAt") or segment.get("ended_at") or "")
        speaker = str(segment.get("speaker") or "speaker")
        text = _clean_text(str(segment.get("text") or ""))
        lines.append(f"- **{ended_at}** `{speaker}`: {text}")

    lines.append("")
    return "\n".join(lines)


def export_json(session_id: str, segments: Iterable[Mapping[str, object]], generated_at: str | None = None) -> str:
    stamp = generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "sessionId": session_id,
        "generatedAt": stamp,
        "segments": list(segments),
    }
    return json.dumps(payload, indent=2) + "\n"


def export_srt(segments: Iterable[Mapping[str, object]]) -> str:
    blocks: List[str] = []
    line_number = 1

    for segment in segments:
        started_raw = str(segment.get("startedAt") or segment.get("started_at") or "")
        ended_raw = str(segment.get("endedAt") or segment.get("ended_at") or "")
        speaker = str(segment.get("speaker") or "speaker")
        text = _clean_text(str(segment.get("text") or ""))

        if not started_raw or not ended_raw:
            continue

        try:
            started_at = _parse_iso(started_raw)
            ended_at = _parse_iso(ended_raw)
        except ValueError:
            continue

        if ended_at <= started_at:
            ended_at = started_at + timedelta(milliseconds=1)

        block = "\n".join(
            [
                str(line_number),
                f"{_to_srt_time(started_at)} --> {_to_srt_time(ended_at)}",
                f"{speaker}: {text}",
            ]
        )
        blocks.append(block)
        line_number += 1

    return ("\n\n".join(blocks) + "\n") if blocks else "\n"


__all__ = ["export_markdown", "export_json", "export_srt"]
