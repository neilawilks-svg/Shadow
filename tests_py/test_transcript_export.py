from __future__ import annotations

import json

from transcript_export import export_json, export_markdown, export_srt


def test_markdown_export_shape() -> None:
    body = export_markdown(
        "session-123",
        [
            {
                "speaker": "chair",
                "text": "Welcome everyone",
                "endedAt": "2026-03-04T09:00:00.000Z",
            }
        ],
        generated_at="2026-03-04T09:10:00.000Z",
    )

    assert "# Meeting Transcript (session-123)" in body
    assert "Generated at: 2026-03-04T09:10:00.000Z" in body
    assert "`chair`: Welcome everyone" in body


def test_json_export_shape() -> None:
    body = export_json(
        "session-xyz",
        [{"speaker": "morgan", "text": "Pilot first."}],
        generated_at="2026-03-04T09:10:00.000Z",
    )

    payload = json.loads(body)
    assert payload["sessionId"] == "session-xyz"
    assert payload["generatedAt"] == "2026-03-04T09:10:00.000Z"
    assert payload["segments"][0]["speaker"] == "morgan"


def test_srt_export_handles_overlap_and_invalid_rows() -> None:
    body = export_srt(
        [
            {
                "speaker": "speaker",
                "text": "First line",
                "startedAt": "2026-03-04T09:00:02.000Z",
                "endedAt": "2026-03-04T09:00:01.000Z",
            },
            {
                "speaker": "speaker",
                "text": "ignored malformed",
                "startedAt": "bad",
                "endedAt": "also bad",
            },
            {
                "speaker": "morgan",
                "text": "Second line",
                "startedAt": "2026-03-04T09:00:03.000Z",
                "endedAt": "2026-03-04T09:00:05.000Z",
            },
        ]
    )

    assert "1\n09:00:02,000 --> 09:00:02,001\nspeaker: First line" in body
    assert "2\n09:00:03,000 --> 09:00:05,000\nmorgan: Second line" in body
    assert "ignored malformed" not in body


def test_srt_empty_output() -> None:
    assert export_srt([]) == "\n"
