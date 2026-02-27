from __future__ import annotations

import json
import zipfile
from pathlib import Path

from ingest_board_docs import ingest


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_ingest_builds_vault_and_rag_store(tmp_path: Path) -> None:
    source_dir = tmp_path / "new-files"
    vault_dir = tmp_path / "local" / "board-vault"
    rag_dir = tmp_path / "local" / "rag-store"
    source_dir.mkdir(parents=True)

    (source_dir / "2026 Q1 - Agenda.txt").write_text(
        "London CAB\nMarch 4, 2026\nAttendees: Anthony Battle, Morgan\nAgenda: risk and innovation",
        encoding="utf-8",
    )

    zip_path = source_dir / "personas.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(
            "Executive Persona - Sophie Bailes.txt",
            "Sophie Bailes\nFocus on quality, evidence, and governance controls.",
        )

    manifest = ingest(source_dir=source_dir, vault_dir=vault_dir, rag_dir=rag_dir)

    assert len(manifest["documents"]) >= 2

    index_path = vault_dir / "index.json"
    assert index_path.exists()

    rag_chunks_path = rag_dir / "chunks.jsonl"
    rag_index_path = rag_dir / "index.json"
    assert rag_chunks_path.exists()
    assert rag_index_path.exists()

    rag_index = _read_json(rag_index_path)
    assert len(rag_index["documents"]) >= 2
    assert isinstance(rag_index.get("terms"), dict)

    docs = manifest["documents"]
    agenda_doc = next(item for item in docs if "agenda" in item["title"].lower())
    agenda_md = Path(agenda_doc["vault_path"])
    assert agenda_md.exists()
    content = agenda_md.read_text(encoding="utf-8")
    assert "meeting_date: 2026-03-04" in content
    assert "[[Person - Anthony Battle]]" in content


def test_ingest_supports_single_file_mode(tmp_path: Path) -> None:
    source_dir = tmp_path / "new-files"
    vault_dir = tmp_path / "vault"
    rag_dir = tmp_path / "rag"
    source_dir.mkdir(parents=True)

    target_file = tmp_path / "upload.txt"
    target_file.write_text("Morgan notes\nPerson: Vivek Ganotra", encoding="utf-8")

    manifest = ingest(
        source_dir=source_dir,
        vault_dir=vault_dir,
        rag_dir=rag_dir,
        single_file=target_file,
    )

    assert len(manifest["documents"]) == 1
    only_doc = manifest["documents"][0]
    assert only_doc["source_path"].endswith("upload.txt")
