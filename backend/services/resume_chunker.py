"""Section-aware resume chunking for RAG.

A resume is split into logical sections (experience, projects, skills,
education, certifications, summary, other) using heading detection, then each
section is split into overlapping character windows on sentence / bullet
boundaries.  Every chunk carries metadata so retrieval results can be cited
back to a section and position in the document.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict

from core.config import settings

SECTION_PATTERNS: dict[str, re.Pattern] = {
    "summary": re.compile(r"^\s*(professional\s+)?(summary|profile|objective|about\s*me)\s*:?\s*$", re.I),
    "experience": re.compile(
        r"^\s*((work|professional|employment)\s+)?(experience|history)|internships?\s*:?\s*$", re.I
    ),
    "projects": re.compile(r"^\s*((academic|personal|key|selected)\s+)?projects?\s*:?\s*$", re.I),
    "skills": re.compile(
        r"^\s*((technical|core|key)\s+)?(skills|competencies|technologies|tech(nical)?\s+stack|tools)\s*:?\s*$",
        re.I,
    ),
    "education": re.compile(r"^\s*(education|academics?|qualifications?)\s*:?\s*$", re.I),
    "certifications": re.compile(
        r"^\s*(certifications?|certificates?|courses?|licen[cs]es?|training|awards?|achievements?|honou?rs?)\s*:?\s*$",
        re.I,
    ),
    "publications": re.compile(r"^\s*(publications?|research|papers?)\s*:?\s*$", re.I),
}

_BULLET_RE = re.compile(r"^\s*[•\-•▪●*>·]\s*")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


@dataclass
class ResumeChunk:
    chunk_id: str
    candidate_id: str
    section: str
    chunk_index: int
    section_index: int
    text: str
    char_start: int
    char_end: int

    def to_document(self) -> dict:
        return {
            "id": self.chunk_id,
            "text": self.text,
            "metadata": {
                "candidate_id": self.candidate_id,
                "section": self.section,
                "chunk_index": self.chunk_index,
                "section_index": self.section_index,
                "char_start": self.char_start,
                "char_end": self.char_end,
                "doc_type": "resume_chunk",
            },
        }


def detect_sections(text: str) -> list[tuple[str, str]]:
    """Return ordered (section_name, section_text) pairs."""
    lines = text.splitlines()
    sections: list[tuple[str, list[str]]] = [("header", [])]
    for raw in lines:
        line = raw.strip()
        if not line:
            sections[-1][1].append("")
            continue
        matched = None
        # Headings are short and often upper-case; avoid matching long bullet sentences.
        if len(line) <= 48:
            for name, pat in SECTION_PATTERNS.items():
                if pat.match(line):
                    matched = name
                    break
        if matched:
            sections.append((matched, []))
        else:
            sections[-1][1].append(line)
    out = []
    for name, body in sections:
        content = "\n".join(body).strip()
        if content:
            out.append((name, content))
    return out


def _split_units(section_text: str) -> list[str]:
    """Split a section into bullet lines / sentences that are never broken mid-way."""
    units: list[str] = []
    for line in section_text.splitlines():
        line = line.strip()
        if not line:
            continue
        line = _BULLET_RE.sub("", line)
        if len(line) > settings.RAG_CHUNK_SIZE:
            units.extend(s.strip() for s in _SENTENCE_SPLIT.split(line) if s.strip())
        else:
            units.append(line)
    return units


def chunk_resume(candidate_id: str, text: str, chunk_size: int | None = None, overlap: int | None = None) -> list[ResumeChunk]:
    """Chunk a resume into section-tagged, overlapping windows."""
    chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
    overlap = overlap if overlap is not None else settings.RAG_CHUNK_OVERLAP
    chunks: list[ResumeChunk] = []
    cursor = 0
    chunk_index = 0

    for section_index, (section, body) in enumerate(detect_sections(text)):
        units = _split_units(body)
        window: list[str] = []
        window_len = 0
        start_offset = text.find(body, cursor)
        if start_offset == -1:
            start_offset = cursor
        local_pos = 0

        def flush(window_units: list[str], pos: int):
            nonlocal chunk_index
            chunk_text = "\n".join(window_units).strip()
            if not chunk_text:
                return
            chunks.append(
                ResumeChunk(
                    chunk_id=f"{candidate_id}:{section}:{chunk_index}",
                    candidate_id=candidate_id,
                    section=section,
                    chunk_index=chunk_index,
                    section_index=section_index,
                    text=f"[{section.upper()}]\n{chunk_text}",
                    char_start=start_offset + max(0, pos - len(chunk_text)),
                    char_end=start_offset + pos,
                )
            )
            chunk_index += 1

        for unit in units:
            if window and window_len + len(unit) + 1 > chunk_size:
                flush(window, local_pos)
                # keep tail units for overlap
                tail: list[str] = []
                tail_len = 0
                for u in reversed(window):
                    if tail_len + len(u) > overlap:
                        break
                    tail.insert(0, u)
                    tail_len += len(u) + 1
                window = tail
                window_len = tail_len
            window.append(unit)
            window_len += len(unit) + 1
            local_pos += len(unit) + 1
        if window:
            flush(window, local_pos)
        cursor = start_offset + len(body)

    if not chunks and text.strip():
        chunks.append(
            ResumeChunk(
                chunk_id=f"{candidate_id}:other:0",
                candidate_id=candidate_id,
                section="other",
                chunk_index=0,
                section_index=0,
                text=text.strip()[:chunk_size],
                char_start=0,
                char_end=min(len(text), chunk_size),
            )
        )
    return chunks


def chunks_to_dicts(chunks: list[ResumeChunk]) -> list[dict]:
    return [asdict(c) for c in chunks]
