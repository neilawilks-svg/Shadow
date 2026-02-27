#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import textwrap
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from converters.docx_to_md import extract_docx_text
from converters.pdf_to_md import extract_pdf_text
from converters.pptx_to_md import extract_pptx_text

KNOWN_PEOPLE = [
    "Anthony Battle",
    "Constantin Beier",
    "Dean Curtis",
    "Gabi Wagenhofer",
    "Karan Khanna",
    "Marco van den Berg",
    "Sophie Bailes",
    "Vivek Ganotra",
    "Dave Williams",
    "Davi Quintiere",
    "Morgan",
]

MEETING_WIKI = "[[Meeting - London CAB - 2026-03-04]]"


@dataclass
class DocArtifact:
    source_path: str
    title: str
    source_type: str
    text: str
    category: str
    meeting_date: str | None


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "doc"


def make_doc_id(title: str, source_path: str) -> str:
    base = slugify(title)
    digest = hashlib.sha1(source_path.encode("utf-8")).hexdigest()[:8]
    return f"{base}-{digest}"


def infer_category(name: str) -> str:
    lowered = name.lower()
    if "agenda" in lowered or "transcript" in lowered:
        return "meetings"
    if "profile" in lowered or any(person.lower() in lowered for person in KNOWN_PEOPLE):
        return "people"
    return "briefs"


def infer_meeting_date(name: str, text: str) -> str | None:
    lowered = name.lower()
    if "2026 q1 - agenda" in lowered or "march 4" in text.lower():
        return "2026-03-04"
    if "nov 19" in lowered or "19 november 2025" in text.lower():
        return "2025-11-19"
    return None


def detect_people(text: str) -> List[str]:
    found: List[str] = []
    lowered = text.lower()
    for person in KNOWN_PEOPLE:
        if person.lower() in lowered:
            found.append(person)
    return found


def detect_tags(name: str, text: str) -> List[str]:
    tags = set()
    lowered = f"{name}\n{text}".lower()

    tag_rules = {
        "agenda": ["agenda", "framing questions"],
        "transcript": ["transcript", "meeting"],
        "disc": ["disc", "archetype", "personality"],
        "executive-persona": ["executive persona", "persona profile"],
        "ai": ["ai", "agent", "model"],
        "pricing": ["pricing", "time & materials", "outcome-based"],
        "innovation": ["innovation", "transformation"],
        "risk": ["risk", "governance", "control"],
        "cab": ["cab", "customer advisory board"],
    }

    for tag, markers in tag_rules.items():
        if any(marker in lowered for marker in markers):
            tags.add(tag)

    if "2026" in lowered:
        tags.add("2026")
    if "2025" in lowered:
        tags.add("2025")

    return sorted(tags)


def link_entities(text: str) -> str:
    linked = text
    for person in sorted(KNOWN_PEOPLE, key=len, reverse=True):
        pattern = re.compile(rf"\b{re.escape(person)}\b")
        replacement = f"[[Person - {person}]]"
        linked = pattern.sub(replacement, linked)

    linked = linked.replace("London CAB", "[[Meeting - London CAB]]")
    return linked


def convert_text(path: Path, source_type: str) -> str:
    if source_type == "docx":
        return extract_docx_text(path)
    if source_type == "pptx":
        return extract_pptx_text(path)
    if source_type == "pdf":
        return extract_pdf_text(path)
    if source_type in {"md", "txt"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    return ""


def bytes_to_text(name: str, raw: bytes) -> Tuple[str, str]:
    suffix = Path(name).suffix.lower().lstrip(".")
    if suffix not in {"docx", "pptx", "pdf", "md", "txt"}:
        return suffix or "other", ""

    temp = Path("/tmp") / f"morgan-ingest-{slugify(name)}"
    temp.write_bytes(raw)
    try:
        text = convert_text(temp, suffix)
    finally:
        try:
            temp.unlink(missing_ok=True)
        except Exception:
            pass

    return suffix, text


def iter_source_files(source_dir: Path) -> Iterable[Path]:
    for path in sorted(source_dir.iterdir()):
        if path.name.startswith("."):
            continue
        if path.is_file():
            yield path


def extract_artifacts(source_dir: Path, single_file: Path | None = None) -> List[DocArtifact]:
    artifacts: List[DocArtifact] = []
    candidates = [single_file] if single_file else list(iter_source_files(source_dir))

    for source in candidates:
        if source is None or not source.exists() or not source.is_file():
            continue

        suffix = source.suffix.lower().lstrip(".")
        if suffix == "zip":
            with zipfile.ZipFile(source) as archive:
                for member in archive.namelist():
                    member_suffix = Path(member).suffix.lower().lstrip(".")
                    if member_suffix not in {"docx", "pptx", "pdf", "md", "txt"}:
                        continue

                    raw = archive.read(member)
                    source_type, text = bytes_to_text(member, raw)
                    if not text.strip():
                        continue

                    title = Path(member).stem
                    category = infer_category(member)
                    meeting_date = infer_meeting_date(member, text)
                    artifacts.append(
                        DocArtifact(
                            source_path=f"{source}/{member}",
                            title=title,
                            source_type=source_type,
                            text=text,
                            category=category,
                            meeting_date=meeting_date,
                        )
                    )
            continue

        if suffix not in {"docx", "pptx", "pdf", "md", "txt"}:
            continue

        text = convert_text(source, suffix)
        if not text.strip():
            continue

        artifacts.append(
            DocArtifact(
                source_path=str(source),
                title=source.stem,
                source_type=suffix,
                text=text,
                category=infer_category(source.name),
                meeting_date=infer_meeting_date(source.name, text),
            )
        )

    return artifacts


def maybe_cleanup_with_ai(text: str, enabled: bool) -> str:
    if not enabled:
        return text
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return text

    try:
        from openai import OpenAI
    except Exception:
        return text

    prompt = textwrap.dedent(
        """
        Normalize this extracted board document into concise markdown.
        Keep factual content. Improve headings and readability.
        Do not invent information.
        """
    ).strip()

    client = OpenAI(api_key=api_key)
    snippet = text[:9000]

    try:
        result = client.responses.create(
            model=os.environ.get("MODEL_PERSONA_SYNTHESIS", "gpt-4.1"),
            input=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": snippet},
            ],
            temperature=0.1,
        )
    except Exception:
        return text

    output_text = ""
    for item in getattr(result, "output", []) or []:
        content = getattr(item, "content", None)
        if not content:
            continue
        for part in content:
            maybe_text = getattr(part, "text", "")
            if maybe_text:
                output_text += maybe_text

    return output_text.strip() or text


def chunk_text(doc_id: str, text: str, chunk_size: int = 1200, overlap: int = 120) -> List[Dict[str, object]]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    chunks: List[Dict[str, object]] = []
    cursor = 0
    index = 0
    while cursor < len(normalized):
        end = min(len(normalized), cursor + chunk_size)
        window = normalized[cursor:end].strip()
        if window:
            chunk_id = f"{doc_id}-chunk-{index:03d}"
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "text": window,
                    "token_estimate": max(1, len(window) // 4),
                }
            )
            index += 1

        if end >= len(normalized):
            break
        cursor = max(0, end - overlap)

    return chunks


def tokenize(text: str) -> List[str]:
    return [token for token in re.findall(r"[a-z0-9]{3,}", text.lower()) if len(token) >= 3]


def write_markdown(path: Path, front_matter: Dict[str, object], body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fm_lines = ["---"]
    for key, value in front_matter.items():
        if isinstance(value, list):
            fm_lines.append(f"{key}:")
            for item in value:
                fm_lines.append(f"  - {item}")
        elif value is None:
            fm_lines.append(f"{key}: null")
        else:
            fm_lines.append(f"{key}: {value}")
    fm_lines.append("---")
    content = "\n".join(fm_lines) + "\n\n" + body.strip() + "\n"
    path.write_text(content, encoding="utf-8")


def ingest(
    source_dir: Path,
    vault_dir: Path,
    rag_dir: Path,
    cleanup_ai: bool = False,
    single_file: Path | None = None,
) -> Dict[str, object]:
    artifacts = extract_artifacts(source_dir=source_dir, single_file=single_file)

    generated_at = now_iso()
    records: List[Dict[str, object]] = []
    rag_chunks: List[Dict[str, object]] = []
    lexical_index: Dict[str, set[str]] = {}

    for artifact in artifacts:
        cleaned_text = maybe_cleanup_with_ai(artifact.text, cleanup_ai)
        linked_text = link_entities(cleaned_text)
        people = detect_people(linked_text)
        tags = detect_tags(artifact.title, linked_text)

        doc_id = make_doc_id(artifact.title, artifact.source_path)
        title = artifact.title.strip() or doc_id

        category_dir = vault_dir / artifact.category
        md_path = category_dir / f"{doc_id}.md"

        if artifact.meeting_date == "2026-03-04" and MEETING_WIKI not in linked_text:
            linked_text = f"{linked_text}\n\nRelated: {MEETING_WIKI}\n"

        front_matter = {
            "id": doc_id,
            "title": title,
            "source_path": artifact.source_path,
            "source_type": artifact.source_type,
            "meeting_date": artifact.meeting_date,
            "people": people,
            "tags": tags,
            "created_at": generated_at,
            "confidentiality": "local_only",
        }

        write_markdown(md_path, front_matter, linked_text)

        chunks = chunk_text(doc_id, linked_text)
        chunk_ids: List[str] = []
        for chunk in chunks:
            chunk_id = str(chunk["chunk_id"])
            chunk_ids.append(chunk_id)
            rag_chunk = {
                "chunk_id": chunk_id,
                "doc_id": doc_id,
                "text": chunk["text"],
                "source_path": artifact.source_path,
                "tags": tags,
                "meeting_date": artifact.meeting_date,
                "people": people,
                "token_estimate": chunk["token_estimate"],
            }
            rag_chunks.append(rag_chunk)
            for token in tokenize(str(chunk["text"])):
                lexical_index.setdefault(token, set()).add(chunk_id)

        records.append(
            {
                "id": doc_id,
                "title": title,
                "source_path": artifact.source_path,
                "source_type": artifact.source_type,
                "meeting_date": artifact.meeting_date,
                "people": people,
                "tags": tags,
                "created_at": generated_at,
                "updated_at": generated_at,
                "confidentiality": "local_only",
                "vault_path": str(md_path),
                "summary": linked_text[:480].replace("\n", " "),
                "chunk_ids": chunk_ids,
            }
        )

    vault_dir.mkdir(parents=True, exist_ok=True)
    rag_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "generated_at": generated_at,
        "documents": records,
    }

    (vault_dir / "index.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    chunks_path = rag_dir / "chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as handle:
        for chunk in rag_chunks:
            handle.write(json.dumps(chunk) + "\n")

    rag_index = {
        "generated_at": generated_at,
        "documents": [
            {
                "id": record["id"],
                "title": record["title"],
                "source_path": record["source_path"],
                "vault_path": record["vault_path"],
                "tags": record["tags"],
                "meeting_date": record["meeting_date"],
                "people": record["people"],
            }
            for record in records
        ],
        "terms": {term: sorted(ids) for term, ids in lexical_index.items()},
    }
    (rag_dir / "index.json").write_text(json.dumps(rag_index, indent=2) + "\n", encoding="utf-8")

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest board source docs into local markdown vault + rag store")
    parser.add_argument("--source-dir", type=Path, default=Path("new-files"))
    parser.add_argument("--vault-dir", type=Path, default=Path("local/board-vault"))
    parser.add_argument("--rag-dir", type=Path, default=Path("local/rag-store"))
    parser.add_argument("--input-file", type=Path, default=None)
    parser.add_argument("--cleanup-ai", action="store_true")

    args = parser.parse_args()

    manifest = ingest(
        source_dir=args.source_dir,
        vault_dir=args.vault_dir,
        rag_dir=args.rag_dir,
        cleanup_ai=args.cleanup_ai,
        single_file=args.input_file,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
