"""Timezone helpers.

SQLite returns naive datetimes for ``DateTime(timezone=True)`` columns, while
PostgreSQL returns aware ones.  Normalise before arithmetic.
"""

from __future__ import annotations

from datetime import datetime, timezone


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def seconds_between(start: datetime | None, end: datetime | None) -> int | None:
    start, end = ensure_utc(start), ensure_utc(end)
    if start is None or end is None:
        return None
    return int((end - start).total_seconds())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
