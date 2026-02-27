from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

DRAWING_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _slide_sort_key(name: str) -> int:
    match = re.search(r"slide(\d+)\.xml", name)
    if not match:
        return 10_000
    return int(match.group(1))


def _iter_slide_lines(xml_data: bytes) -> Iterable[str]:
    root = ET.fromstring(xml_data)
    words = [_clean(node.text or "") for node in root.iter(f"{DRAWING_NS}t") if node.text]
    words = [word for word in words if word]
    if words:
        yield " | ".join(words)


def extract_pptx_text(path: Path, max_chars: int = 150_000) -> str:
    with zipfile.ZipFile(path) as archive:
        slides = sorted(
            [
                name
                for name in archive.namelist()
                if name.startswith("ppt/slides/slide") and name.endswith(".xml")
            ],
            key=_slide_sort_key,
        )

        lines = []
        total = 0
        for slide_name in slides:
            xml_data = archive.read(slide_name)
            slide_lines = list(_iter_slide_lines(xml_data))
            if slide_lines:
                line = f"[{Path(slide_name).name}] {slide_lines[0]}"
                lines.append(line)
                total += len(line) + 1
                if total >= max_chars:
                    break

    return "\n".join(lines)
