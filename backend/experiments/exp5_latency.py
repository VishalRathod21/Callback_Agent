"""Experiment 5 — Latency and completion metrics from real persisted interview data.

Reads the application database (``DATABASE_URL`` of the running deployment, or
the dev SQLite file) and reports:
    * question generation latency (ms) and answer evaluation latency (ms)
      from `interview_questions`, split by evaluation_source
    * interview completion rate = completed / (completed + cancelled + active)
    * voice transcription latency, if the websocket log file is provided
      (``--log path``; lines containing ``stt_latency_ms``)
Nothing is simulated: if the database has no sessions the script says so.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def pct(values, p):
    if not values:
        return None
    s = sorted(values)
    return round(s[min(len(s) - 1, int(p * (len(s) - 1)))], 1)


async def run(db_url: str | None, log: str | None):
    if db_url:
        os.environ["DATABASE_URL"] = db_url
    os.environ.setdefault("TESTING", "true")
    from common import save  # noqa: E402  (sets sys.path / env)
    from core.database import AsyncSessionLocal
    from core.models import InterviewQuestion, InterviewSession, SessionStatus
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        qs = (await db.execute(select(InterviewQuestion))).scalars().all()
        sessions = (await db.execute(select(InterviewSession))).scalars().all()

    gen = [q.generation_latency_ms for q in qs if q.generation_latency_ms is not None]
    by_source: dict[str, list[int]] = {}
    for q in qs:
        if q.evaluation_latency_ms is not None:
            by_source.setdefault(q.evaluation_source or "unknown", []).append(q.evaluation_latency_ms)
    status_counts = {s.value: sum(1 for x in sessions if x.status == s) for s in SessionStatus}
    denom = status_counts["completed"] + status_counts["cancelled"] + status_counts["active"]

    stt = []
    if log and Path(log).exists():
        for line in Path(log).read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.search(r"stt_latency_ms\D+(\d+)", line)
            if m:
                stt.append(int(m.group(1)))

    out = {
        "database": os.environ.get("DATABASE_URL"),
        "questions": len(qs),
        "generation_latency_ms": {"n": len(gen), "mean": round(statistics.mean(gen), 1) if gen else None, "p50": pct(gen, 0.5), "p95": pct(gen, 0.95)},
        "evaluation_latency_ms_by_source": {
            k: {"n": len(v), "mean": round(statistics.mean(v), 1), "p50": pct(v, 0.5), "p95": pct(v, 0.95)} for k, v in by_source.items()
        },
        "sessions_by_status": status_counts,
        "interview_completion_rate": round(status_counts["completed"] / denom, 3) if denom else None,
        "voice_transcription_latency_ms": {"n": len(stt), "mean": round(statistics.mean(stt), 1) if stt else None, "p95": pct(stt, 0.95)} if stt else "no STT log provided",
    }
    save("exp5_latency", out)
    print(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="sqlite+aiosqlite:///./interviewai_dev.db", help="SQLAlchemy URL of the deployment DB")
    ap.add_argument("--log", default=None, help="backend log file with stt_latency_ms entries")
    a = ap.parse_args()
    asyncio.run(run(a.db, a.log))
