from __future__ import annotations

import subprocess
from pathlib import Path


def extract_pdf_text(path: Path, max_chars: int = 150_000) -> str:
    process = subprocess.run(
        ["pdftotext", str(path), "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        text=True,
    )
    if process.returncode != 0:
        return ""

    text = process.stdout.replace("\r\n", "\n")
    return text[:max_chars]
