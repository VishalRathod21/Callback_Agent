"""Experiment 3 — Fixed vs adaptive difficulty (simulation on the real policy code).

We simulate candidates with a latent ability θ ∈ [0, 10].  An answer to a
question of difficulty d yields an observed score drawn from
N(θ − penalty(d), σ²) clipped to [0, 10], where penalty(easy, medium, hard) =
(−1, 0, +1.5).  The *same* DifficultyPolicy used in production decides the next
difficulty in the adaptive condition; the fixed condition keeps the configured
level.

Metrics
    ability_discrimination : Spearman correlation between θ and the final round score
    mean_abs_error         : |final score/10 − θ| on average (lower is better)
    time_at_level          : share of questions asked at the level closest to θ
    difficulty_trace       : example traces
"""

from __future__ import annotations

import random
import statistics

from common import save


def simulate(adaptive: bool, n_candidates: int = 200, n_questions: int = 6, start: str = "medium", seed: int = 7):
    from agents.difficulty_policy import DifficultyPolicy, LEVELS
    from scipy.stats import spearmanr

    rng = random.Random(seed)
    policy = DifficultyPolicy(enabled=adaptive)
    penalty = {"easy": -1.0, "medium": 0.0, "hard": 1.5}
    thetas, finals, at_level, traces = [], [], [], []
    for i in range(n_candidates):
        theta = rng.uniform(1.5, 9.5)
        level = start
        scores, trace = [], []
        target_level = "easy" if theta < 4.5 else ("medium" if theta < 7.5 else "hard")
        for _ in range(n_questions):
            raw = rng.gauss(theta - penalty[level], 1.2)
            score = max(0.0, min(10.0, raw))
            # difficulty-weighted credit: harder questions answered well are worth more
            weight = {"easy": 0.85, "medium": 1.0, "hard": 1.15}[level]
            scores.append(min(10.0, score * weight))
            trace.append(level)
            level = policy.decide(score, level).next
        thetas.append(theta)
        finals.append(statistics.mean(scores))
        at_level.append(sum(1 for lvl in trace if lvl == target_level) / n_questions)
        if i < 3:
            traces.append({"theta": round(theta, 2), "trace": trace, "final": round(statistics.mean(scores), 2)})
    rho, _ = spearmanr(thetas, finals)
    mae = statistics.mean(abs(f - t) for f, t in zip(finals, thetas))
    return {"spearman_rho": round(float(rho), 3), "mean_abs_error": round(mae, 3),
            "time_at_target_level": round(statistics.mean(at_level), 3), "example_traces": traces,
            "n_candidates": n_candidates, "n_questions": n_questions, "start_level": start, "levels": LEVELS}


def run():
    out = {"adaptive": simulate(True), "fixed_medium": simulate(False, start="medium"),
           "fixed_easy": simulate(False, start="easy"), "fixed_hard": simulate(False, start="hard")}
    out["notes"] = ("Simulation uses the production DifficultyPolicy with configured thresholds. "
                    "Observed scores are synthetic (latent-ability model); this experiment measures the policy, not the LLM.")
    save("exp3_fixed_vs_adaptive", out)
    for k, v in out.items():
        if isinstance(v, dict):
            print(k, {m: v[m] for m in ("spearman_rho", "mean_abs_error", "time_at_target_level")})


if __name__ == "__main__":
    run()
