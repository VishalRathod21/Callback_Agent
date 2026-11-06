"""Experiment 4 — Agreement between AI evaluation and human evaluators.

Input: ``human_ratings.csv`` with columns
    question,answer,human_overall,human_technical,human_conceptual,human_completeness,human_communication
(0–10 scale, one row per evaluated answer; multiple raters may be averaged
beforehand).  A template with the expected columns is written if the file is
missing — NO synthetic human scores are ever generated.

The script scores every answer with the production EvaluationAgent and reports
Pearson r, Spearman ρ, mean absolute error and quadratic-weighted Cohen's κ on
rounded scores, per criterion.  If the LLM is unavailable the AI column is the
heuristic estimate and the output says so.
"""

from __future__ import annotations

import asyncio
import csv
from pathlib import Path

from common import save

HUMAN_FILE = Path(__file__).parent / "human_ratings.csv"
COLUMNS = ["question", "answer", "human_overall", "human_technical", "human_conceptual", "human_completeness", "human_communication"]


def write_template():
    with HUMAN_FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerow(["Explain the difference between a list and a tuple in Python.",
                    "A list is mutable; a tuple is immutable and hashable so it can be a dict key.", "", "", "", "", ""])
    print(f"No human ratings found. Template written to {HUMAN_FILE} — fill the human_* columns (0-10) and re-run.")


async def run():
    if not HUMAN_FILE.exists():
        write_template()
        save("exp4_human_agreement", {"status": "not_run", "reason": "human_ratings.csv missing - template created"})
        return
    rows = [r for r in csv.DictReader(HUMAN_FILE.open(encoding="utf-8")) if r.get("human_overall", "").strip()]
    if len(rows) < 3:
        save("exp4_human_agreement", {"status": "not_run", "reason": f"only {len(rows)} rated rows (need ≥3)"})
        print("Not enough rated rows to compute agreement.")
        return

    from agents.evaluation_agent import EvaluationAgent
    from scipy.stats import pearsonr, spearmanr
    from sklearn.metrics import cohen_kappa_score

    agent = EvaluationAgent()
    pairs = {k: ([], []) for k in ("overall", "technical", "conceptual", "completeness", "communication")}
    key_map = {"overall": "overall_score", "technical": "technical_correctness", "conceptual": "conceptual_understanding",
               "completeness": "answer_completeness", "communication": "communication_clarity"}
    sources = []
    for r in rows:
        ev = await agent.evaluate_answer(r["question"], r["answer"], difficulty="medium")
        sources.append(ev["evaluation_source"])
        for k, ai_key in key_map.items():
            h = r.get(f"human_{k}", "").strip()
            if h:
                pairs[k][0].append(float(h))
                pairs[k][1].append(float(ev[ai_key]))

    out = {"status": "ok", "n_answers": len(rows), "ai_sources": {s: sources.count(s) for s in set(sources)}, "criteria": {}}
    for k, (human, ai) in pairs.items():
        if len(human) >= 3:
            out["criteria"][k] = {
                "pearson_r": round(float(pearsonr(human, ai)[0]), 3),
                "spearman_rho": round(float(spearmanr(human, ai)[0]), 3),
                "mean_abs_error": round(sum(abs(a - b) for a, b in zip(human, ai)) / len(human), 3),
                "weighted_kappa": round(float(cohen_kappa_score([round(x) for x in human], [round(x) for x in ai], weights="quadratic")), 3),
                "n": len(human),
            }
    save("exp4_human_agreement", out)
    print(out["criteria"])


if __name__ == "__main__":
    asyncio.run(run())
