"""Run every experiment, then plot results into experiments/results/*.png.

    cd backend && venv/Scripts/python experiments/run_all.py
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
RESULTS = HERE / "results"


def run_script(name: str, *args: str) -> None:
    print(f"\n=== {name} ===")
    subprocess.run([sys.executable, str(HERE / name), *args], check=False, cwd=str(HERE.parent))


def plot() -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.facecolor": "white", "axes.spines.top": False, "axes.spines.right": False})

    def load(name):
        p = RESULTS / f"{name}.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    e1 = load("exp1_generic_vs_resume")
    if e1:
        conds = list(e1["summary"])
        metrics = ["mean_resume_term_overlap", "mean_entity_mention_rate", "mean_citation_rate"]
        fig, ax = plt.subplots(figsize=(7, 4))
        w = 0.25
        for i, m in enumerate(metrics):
            ax.bar([x + i * w for x in range(len(conds))], [e1["summary"][c][m] for c in conds], w, label=m.replace("mean_", "").replace("_", " "))
        ax.set_xticks([x + w for x in range(len(conds))]); ax.set_xticklabels(conds)
        ax.set_ylim(0, 1); ax.set_ylabel("rate"); ax.set_title("Exp 1 — question relevance by generation condition"); ax.legend(fontsize=8)
        fig.tight_layout(); fig.savefig(RESULTS / "exp1_relevance.png", dpi=160); plt.close(fig)

    e2 = load("exp2_rag_retrieval")
    if e2:
        fig, ax = plt.subplots(figsize=(7, 4))
        ks = [1, 2, 3]
        for name, style in (("section", "-o"), ("naive", "--s")):
            ax.plot(ks, [e2[name][f"precision@{k}"] for k in ks], style, label=f"{name} chunking · Precision@K")
            ax.plot(ks, [e2[name][f"recall@{k}"] for k in ks], style, alpha=0.6, label=f"{name} chunking · Recall@K")
        ax.set_xticks(ks); ax.set_ylim(0, 1.05); ax.set_xlabel("K"); ax.set_title(f"Exp 2 — retrieval quality ({e2['environment']['embedding_backend']} embeddings)")
        ax.legend(fontsize=8); fig.tight_layout(); fig.savefig(RESULTS / "exp2_retrieval.png", dpi=160); plt.close(fig)

    e3 = load("exp3_fixed_vs_adaptive")
    if e3:
        conds = [k for k in e3 if isinstance(e3[k], dict) and "spearman_rho" in e3[k]]
        fig, axes = plt.subplots(1, 3, figsize=(10, 3.6))
        for ax, m in zip(axes, ("spearman_rho", "mean_abs_error", "time_at_target_level")):
            ax.bar(conds, [e3[c][m] for c in conds], color=["#8B5CF6" if c == "adaptive" else "#A1A1AA" for c in conds])
            ax.set_title(m.replace("_", " ")); ax.tick_params(axis="x", rotation=20)
        fig.suptitle("Exp 3 — fixed vs adaptive difficulty (policy simulation)"); fig.tight_layout()
        fig.savefig(RESULTS / "exp3_adaptive.png", dpi=160); plt.close(fig)

    e5 = load("exp5_latency")
    if e5 and e5.get("evaluation_latency_ms_by_source"):
        fig, ax = plt.subplots(figsize=(6, 3.6))
        src = e5["evaluation_latency_ms_by_source"]
        ax.bar(list(src), [v["mean"] for v in src.values()])
        if e5["generation_latency_ms"]["mean"] is not None:
            ax.axhline(e5["generation_latency_ms"]["mean"], ls="--", color="#8B5CF6", label="question generation (mean)")
            ax.legend(fontsize=8)
        ax.set_ylabel("ms"); ax.set_title("Exp 5 — evaluation latency by source"); fig.tight_layout()
        fig.savefig(RESULTS / "exp5_latency.png", dpi=160); plt.close(fig)
    print("plots written to", RESULTS)


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    run_script("exp1_generic_vs_resume.py")
    run_script("exp2_rag_retrieval.py")
    run_script("exp3_fixed_vs_adaptive.py")
    run_script("exp4_human_agreement.py")
    run_script("exp5_latency.py", *sys.argv[1:])
    plot()
