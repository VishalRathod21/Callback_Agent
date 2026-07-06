"""Resume parsing service for PDF and DOCX files."""

import logging
from pathlib import Path

import fitz  # PyMuPDF
from docx import Document

logger = logging.getLogger(__name__)


async def parse_resume(file_path: str) -> dict:
    """Parse a resume file and extract its text content.

    Supports PDF (.pdf) and Word (.docx) formats.

    Args:
        file_path: Absolute or relative path to the resume file.

    Returns:
        A dict with keys:
            - raw_text: The full extracted text.
            - word_count: Total number of words in the extracted text.
            - pages: Number of pages in the document.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file format is unsupported.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Resume file not found: {file_path}")

    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _parse_pdf(path)
    elif suffix == ".docx":
        return _parse_docx(path)
    else:
        raise ValueError(f"Unsupported file format: {suffix}. Use .pdf or .docx")


def _parse_pdf(path: Path) -> dict:
    """Extract text from a PDF file using PyMuPDF.

    Args:
        path: Path to the PDF file.

    Returns:
        Dict with raw_text, word_count, and pages.
    """
    doc = fitz.open(str(path))
    pages = len(doc)
    text_parts: list[str] = []

    for page in doc:
        text_parts.append(page.get_text())

    doc.close()

    raw_text = "\n".join(text_parts).strip()
    word_count = len(raw_text.split())

    logger.info("Parsed PDF: %s (%d pages, %d words)", path.name, pages, word_count)

    return {
        "raw_text": raw_text,
        "word_count": word_count,
        "pages": pages,
    }


def _parse_docx(path: Path) -> dict:
    """Extract text from a DOCX file using python-docx.

    Args:
        path: Path to the DOCX file.

    Returns:
        Dict with raw_text, word_count, and pages.
    """
    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    raw_text = "\n".join(paragraphs).strip()
    word_count = len(raw_text.split())

    # python-docx doesn't expose page count directly;
    # estimate based on core properties or default to 1
    pages = 1
    try:
        # Some DOCX files store page count in extended properties
        pages = doc.core_properties.revision or 1
    except Exception:
        pass

    logger.info("Parsed DOCX: %s (%d pages, %d words)", path.name, pages, word_count)

    return {
        "raw_text": raw_text,
        "word_count": word_count,
        "pages": pages,
    }
