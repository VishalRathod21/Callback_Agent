"""Adaptive difficulty policy.

Maps the overall score of the latest answer (0-10) to the difficulty of the
next question.  Thresholds are configurable through settings:

    score <= ADAPTIVE_DECREASE_MAX (default 4)  → decrease difficulty
    ADAPTIVE_DECREASE_MAX < score < ADAPTIVE_INCREASE_MIN → keep difficulty
    score >= ADAPTIVE_INCREASE_MIN (default 8)  → increase difficulty

Difficulty is an ordered ladder ``easy → medium → hard``; the policy clamps at
both ends.  ``ADAPTIVE_ENABLED=false`` (or ``adaptive=False`` per session)
turns the policy into a fixed-difficulty policy, which is what Experiment 3
compares against.
"""

from __future__ import annotations

from dataclasses import dataclass

from core.config import settings

LEVELS: list[str] = ["easy", "medium", "hard"]

# Human-readable guidance injected into prompts per level
LEVEL_GUIDANCE: dict[str, str] = {
    "easy": "foundational: definitions, basic usage, simple scenarios; one concept at a time",
    "medium": "intermediate: trade-offs, applied scenarios, debugging, comparing alternatives",
    "hard": "advanced: internals, scale, edge cases, design decisions with constraints, multi-step reasoning",
}


def normalize_level(level: str | None, default: str = "medium") -> str:
    if not level:
        return default
    lvl = str(level).strip().lower()
    aliases = {
        "beginner": "easy", "basic": "easy", "low": "easy",
        "intermediate": "medium", "moderate": "medium", "mid": "medium", "medium/hard": "hard",
        "advanced": "hard", "expert": "hard", "high": "hard", "difficult": "hard",
    }
    lvl = aliases.get(lvl, lvl)
    return lvl if lvl in LEVELS else default


@dataclass(frozen=True)
class PolicyDecision:
    previous: str
    next: str
    direction: str          # "increase" | "decrease" | "maintain"
    score: float | None
    reason: str

    def to_dict(self) -> dict:
        return {
            "previous_difficulty": self.previous,
            "next_difficulty": self.next,
            "direction": self.direction,
            "score": self.score,
            "reason": self.reason,
        }


class DifficultyPolicy:
    def __init__(
        self,
        decrease_max: float | None = None,
        increase_min: float | None = None,
        enabled: bool | None = None,
    ) -> None:
        self.decrease_max = settings.ADAPTIVE_DECREASE_MAX if decrease_max is None else decrease_max
        self.increase_min = settings.ADAPTIVE_INCREASE_MIN if increase_min is None else increase_min
        self.enabled = settings.ADAPTIVE_ENABLED if enabled is None else enabled
        if self.decrease_max >= self.increase_min:
            raise ValueError("decrease_max must be lower than increase_min")

    @staticmethod
    def step(level: str, delta: int) -> str:
        idx = LEVELS.index(normalize_level(level))
        return LEVELS[max(0, min(len(LEVELS) - 1, idx + delta))]

    def decide(self, score: float | None, current: str) -> PolicyDecision:
        current = normalize_level(current)
        if not self.enabled:
            return PolicyDecision(current, current, "maintain", score, "adaptive policy disabled (fixed difficulty)")
        if score is None:
            return PolicyDecision(current, current, "maintain", None, "no score available for the last answer")
        if score <= self.decrease_max:
            nxt = self.step(current, -1)
            direction = "decrease" if nxt != current else "maintain"
            reason = f"score {score:.1f} ≤ {self.decrease_max:g}: test foundations"
        elif score >= self.increase_min:
            nxt = self.step(current, +1)
            direction = "increase" if nxt != current else "maintain"
            reason = f"score {score:.1f} ≥ {self.increase_min:g}: raise the bar"
        else:
            nxt, direction = current, "maintain"
            reason = f"score {score:.1f} within [{self.decrease_max:g}, {self.increase_min:g}]: hold level"
        if nxt == current and direction != "maintain":
            direction = "maintain"
        return PolicyDecision(current, nxt, direction, score, reason)

    def describe(self) -> dict:
        return {
            "enabled": self.enabled,
            "decrease_max": self.decrease_max,
            "increase_min": self.increase_min,
            "levels": LEVELS,
        }


default_policy = DifficultyPolicy()
