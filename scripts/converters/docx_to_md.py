from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _iter_docx_paragraphs(xml_data: bytes) -> Iterable[str]:
    root = ET.fromstring(xml_data)
    for paragraph in root.iter(f"{WORD_NS}p"):
        parts = [node.text for node in paragraph.iter(f"{WORD_NS}t") if node.text]
        line = _clean("".join(parts))
        if line:
            yield line


def extract_docx_text(path: Path, max_chars: int = 150_000) -> str:
    with zipfile.ZipFile(path) as archive:
        if "word/document.xml" not in archive.namelist():
            return ""
        xml_data = archive.read("word/document.xml")

    lines = []
    total = 0
    for line in _iter_docx_paragraphs(xml_data):
        lines.append(line)
        total += len(line) + 1
        if total >= max_chars:
            break

    return "\n".join(lines)
