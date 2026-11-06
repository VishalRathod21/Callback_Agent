"""Shared fixtures for the experimental evaluation.

Everything here runs offline (no API keys needed).  When an LLM key *is*
configured the same scripts exercise the live model and record that fact in
the results JSON (``environment`` block) so numbers are never mixed up.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("FAISS_PERSIST_DIR", str(Path(__file__).parent / "_faiss_exp"))

RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


def environment() -> dict:
    from core.config import settings
    from services.llm_service import llm_service

    return {
        "llm_provider": llm_service.provider_name,
        "llm_available": llm_service.available,
        "embedding_backend": settings.embedding_backend,
        "adaptive_thresholds": {"decrease_max": settings.ADAPTIVE_DECREASE_MAX, "increase_min": settings.ADAPTIVE_INCREASE_MIN},
        "rubric_weights": settings.rubric_weights,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


def save(name: str, payload: dict) -> Path:
    path = RESULTS_DIR / f"{name}.json"
    payload = {"environment": environment(), **payload}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"saved -> {path}")
    return path


# ── Synthetic candidate corpus (5 resumes, distinct profiles) ──────────────────

RESUMES: dict[str, str] = {
    "ml_grad": """Asha Verma
asha@example.com

SUMMARY
M.Tech AI & Data Science student focused on NLP and LLM applications.

SKILLS
Python, PyTorch, scikit-learn, LangChain, LangGraph, FAISS, FastAPI, SQL, Docker

PROJECTS
• Callback Rehearsal – AI mock interview platform using LangGraph multi-agent orchestration, FAISS RAG over resumes, Deepgram STT and ElevenLabs TTS.
• Legal Document QA – retrieval-augmented question answering with sentence-transformers and FAISS; improved answer precision by 18%.
• Traffic Sign Classifier – CNN in PyTorch achieving 97% accuracy on GTSRB.

EXPERIENCE
Data Science Intern, Acme Analytics (Jun 2025 – Aug 2025)
• Built ETL pipelines in Python and SQL processing 2M rows daily.
• Deployed a churn prediction model with scikit-learn and FastAPI.

EDUCATION
M.Tech Integrated (AI & Data Science), DAVV Indore, 2027
""",
    "backend_dev": """Rahul Mehta
rahul@example.com

SUMMARY
Backend engineer building payment systems in Python and Go.

SKILLS
Python, Go, FastAPI, PostgreSQL, Redis, Kafka, Docker, Kubernetes, gRPC

PROJECTS
• PayFlow – payment reconciliation service in FastAPI with PostgreSQL and Redis caching; cut reconciliation time by 40%.
• LogPipe – Kafka based log ingestion pipeline processing 1M events per hour with exactly-once semantics.

EXPERIENCE
Software Engineer, FinCorp (2022 – 2025)
• Designed REST and gRPC APIs; optimised slow SQL queries with composite indexes.
• Led migration of monolith to Kubernetes microservices.

EDUCATION
B.Tech Computer Science, IIT Indore, 2022
""",
    "frontend_dev": """Priya Nair
priya@example.com

SUMMARY
Frontend developer specialising in React design systems and accessibility.

SKILLS
JavaScript, TypeScript, React, Next.js, Tailwind CSS, Redux, Jest, Cypress, Figma

PROJECTS
• DesignKit – component library with 60 accessible React components and Storybook docs.
• ShopLite – Next.js e-commerce storefront with server-side rendering and Lighthouse score 98.

EXPERIENCE
Frontend Engineer, Pixelworks (2021 – 2025)
• Rebuilt checkout flow in React reducing cart abandonment by 12%.
• Introduced Cypress end-to-end tests and visual regression testing.

EDUCATION
B.E. Information Technology, Pune University, 2021
""",
    "data_eng": """Karan Shah
karan@example.com

SUMMARY
Data engineer building batch and streaming pipelines on the cloud.

SKILLS
SQL, Python, Apache Spark, Airflow, Kafka, dbt, Snowflake, AWS, Terraform

PROJECTS
• LakeHouse – Spark + Delta Lake data platform ingesting 5 TB per day with Airflow orchestration.
• MetricsHub – dbt models and Snowflake warehouse powering executive dashboards.

EXPERIENCE
Data Engineer, Retailio (2020 – 2025)
• Reduced pipeline failures 70% with data quality checks and alerting.
• Migrated on-prem Hadoop jobs to AWS EMR with Terraform.

EDUCATION
B.Tech Computer Engineering, NIT Surat, 2020
""",
    "devops": """Meera Iyer
meera@example.com

SUMMARY
DevOps engineer focused on reliability, CI/CD and infrastructure as code.

SKILLS
Linux, Bash, Docker, Kubernetes, Helm, Terraform, Ansible, Jenkins, GitHub Actions, Prometheus, Grafana

PROJECTS
• ZeroDowntime – blue/green deployment pipeline with Jenkins and Helm for 40 services.
• ObserveAll – Prometheus and Grafana observability stack with SLO alerting.

EXPERIENCE
Site Reliability Engineer, CloudNine (2019 – 2025)
• Cut mean time to recovery from 45 to 12 minutes with runbooks and automation.
• Managed multi-region Kubernetes clusters with Terraform.

EDUCATION
B.Tech Electronics, Anna University, 2019
""",
}

RESUME_STRUCTURED: dict[str, dict] = {
    "ml_grad": {"skills": ["Python", "PyTorch", "scikit-learn", "LangChain", "LangGraph", "FAISS", "FastAPI", "SQL"],
                "projects": [{"name": "Callback Rehearsal", "description": "AI mock interview platform", "tech": ["LangGraph", "FAISS"]},
                             {"name": "Legal Document QA", "description": "RAG question answering", "tech": ["FAISS"]},
                             {"name": "Traffic Sign Classifier", "description": "CNN in PyTorch", "tech": ["PyTorch"]}],
                "experience": [{"company": "Acme Analytics", "role": "Data Science Intern", "duration": "2025", "points": ["ETL pipelines"]}],
                "education": [], "summary": "ML student"},
    "backend_dev": {"skills": ["Python", "Go", "FastAPI", "PostgreSQL", "Redis", "Kafka", "Kubernetes"],
                    "projects": [{"name": "PayFlow", "description": "payment reconciliation", "tech": ["FastAPI", "PostgreSQL", "Redis"]},
                                 {"name": "LogPipe", "description": "Kafka ingestion", "tech": ["Kafka"]}],
                    "experience": [{"company": "FinCorp", "role": "Software Engineer", "duration": "2022-2025", "points": []}],
                    "education": [], "summary": "Backend engineer"},
    "frontend_dev": {"skills": ["JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "Jest", "Cypress"],
                     "projects": [{"name": "DesignKit", "description": "component library", "tech": ["React"]},
                                  {"name": "ShopLite", "description": "Next.js storefront", "tech": ["Next.js"]}],
                     "experience": [{"company": "Pixelworks", "role": "Frontend Engineer", "duration": "2021-2025", "points": []}],
                     "education": [], "summary": "Frontend developer"},
    "data_eng": {"skills": ["SQL", "Python", "Spark", "Airflow", "Kafka", "dbt", "Snowflake", "AWS"],
                 "projects": [{"name": "LakeHouse", "description": "Spark data platform", "tech": ["Spark", "Airflow"]},
                              {"name": "MetricsHub", "description": "dbt warehouse", "tech": ["dbt", "Snowflake"]}],
                 "experience": [{"company": "Retailio", "role": "Data Engineer", "duration": "2020-2025", "points": []}],
                 "education": [], "summary": "Data engineer"},
    "devops": {"skills": ["Linux", "Docker", "Kubernetes", "Helm", "Terraform", "Ansible", "Jenkins", "Prometheus"],
               "projects": [{"name": "ZeroDowntime", "description": "blue/green pipeline", "tech": ["Jenkins", "Helm"]},
                            {"name": "ObserveAll", "description": "observability stack", "tech": ["Prometheus", "Grafana"]}],
               "experience": [{"company": "CloudNine", "role": "Site Reliability Engineer", "duration": "2019-2025", "points": []}],
               "education": [], "summary": "DevOps engineer"},
}

TARGET_ROLES = {"ml_grad": "ML Engineer", "backend_dev": "Backend Developer", "frontend_dev": "Frontend Developer",
                "data_eng": "Data Engineer", "devops": "DevOps Engineer"}

# Labelled retrieval queries: (candidate, query, set of relevant sections)
RETRIEVAL_QUERIES: list[tuple[str, str, set[str]]] = [
    ("ml_grad", "retrieval augmented generation with FAISS", {"projects", "skills"}),
    ("ml_grad", "CNN image classification accuracy", {"projects"}),
    ("ml_grad", "ETL pipelines SQL internship", {"experience"}),
    ("ml_grad", "LangGraph multi-agent orchestration", {"projects", "skills"}),
    ("ml_grad", "degree university graduation", {"education"}),
    ("backend_dev", "payment reconciliation Redis caching", {"projects"}),
    ("backend_dev", "Kafka exactly-once ingestion", {"projects"}),
    ("backend_dev", "gRPC API composite index query optimisation", {"experience"}),
    ("backend_dev", "Kubernetes microservices migration", {"experience", "skills"}),
    ("frontend_dev", "accessible React component library Storybook", {"projects"}),
    ("frontend_dev", "checkout flow cart abandonment", {"experience"}),
    ("frontend_dev", "Cypress end-to-end visual regression", {"experience", "skills"}),
    ("data_eng", "Spark Delta Lake Airflow orchestration", {"projects"}),
    ("data_eng", "data quality checks pipeline failures", {"experience"}),
    ("data_eng", "dbt Snowflake warehouse dashboards", {"projects", "skills"}),
    ("devops", "blue green deployment Jenkins Helm", {"projects"}),
    ("devops", "mean time to recovery runbooks", {"experience"}),
    ("devops", "Prometheus Grafana SLO alerting", {"projects", "skills"}),
]


def tokens(text: str) -> set[str]:
    import re
    stop = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "your", "you", "how", "what", "why",
            "would", "did", "do", "does", "is", "are", "was", "were", "it", "this", "that", "me", "about", "one", "which",
            "tell", "explain", "describe", "when", "can", "could", "give", "used", "use", "using", "project", "projects"}
    return {t for t in re.findall(r"[a-z0-9+#.]+", text.lower()) if len(t) > 2 and t not in stop}
