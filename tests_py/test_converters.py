from __future__ import annotations

import zipfile
from pathlib import Path
from types import SimpleNamespace

from converters.docx_to_md import extract_docx_text
from converters.pdf_to_md import extract_pdf_text
from converters.pptx_to_md import extract_pptx_text


def _write_docx(path: Path) -> None:
    xml = """<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>
<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">
  <w:body>
    <w:p><w:r><w:t>London CAB Agenda</w:t></w:r></w:p>
    <w:p><w:r><w:t>March 4, 2026</w:t></w:r></w:p>
  </w:body>
</w:document>
"""
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", xml)


def _write_pptx(path: Path) -> None:
    slide_xml = """<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>
<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p>
            <a:r><a:t>Executive Persona Highlights</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
"""
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("ppt/slides/slide1.xml", slide_xml)


def test_docx_extraction_reads_paragraphs(tmp_path: Path) -> None:
    file_path = tmp_path / "agenda.docx"
    _write_docx(file_path)

    text = extract_docx_text(file_path)

    assert "London CAB Agenda" in text
    assert "March 4, 2026" in text


def test_pptx_extraction_reads_slide_text(tmp_path: Path) -> None:
    file_path = tmp_path / "deck.pptx"
    _write_pptx(file_path)

    text = extract_pptx_text(file_path)

    assert "slide1.xml" in text
    assert "Executive Persona Highlights" in text


def test_pdf_extraction_returns_stdout(monkeypatch, tmp_path: Path) -> None:
    file_path = tmp_path / "brief.pdf"
    file_path.write_bytes(b"%PDF-1.4 fake")

    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(returncode=0, stdout="line one\nline two", stderr="")

    monkeypatch.setattr("converters.pdf_to_md.subprocess.run", fake_run)

    text = extract_pdf_text(file_path)

    assert "line one" in text
    assert "line two" in text


def test_pdf_extraction_returns_empty_on_failure(monkeypatch, tmp_path: Path) -> None:
    file_path = tmp_path / "brief.pdf"
    file_path.write_bytes(b"%PDF-1.4 fake")

    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(returncode=1, stdout="", stderr="missing")

    monkeypatch.setattr("converters.pdf_to_md.subprocess.run", fake_run)

    assert extract_pdf_text(file_path) == ""
