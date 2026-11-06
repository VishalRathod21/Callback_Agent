# Project Synopsis

**Title:** AI-Powered Personalized Mock Interview and Adaptive Candidate Evaluation System
**Project name:** Callback Rehearsal – InterviewAI
**Programme:** M.Tech Integrated (Artificial Intelligence & Data Science) — Minor Project
**Domain:** Generative AI · NLP · Retrieval-Augmented Generation · Multi-Agent Systems · Speech Processing

---

## 1. Problem statement

Technical hiring interviews are high-stakes, but realistic practice is scarce. Existing preparation resources are
either static (question banks, videos) or generic chatbots that ignore the candidate's actual background. They do
not (a) ask questions grounded in what the candidate has really built, (b) adapt difficulty to the candidate's
demonstrated level, or (c) produce consistent, rubric-based feedback that separates technical correctness from
fluent delivery.

## 2. Motivation

Candidates with strong resumes often under-perform in interviews because they have never been asked to defend
their own projects under time pressure. A personalised simulator that reads the resume, conducts multi-round
interviews (coding, technical, behavioural) through voice or text, scores answers against an explicit rubric and
adapts in real time can close this gap, while also providing a test-bed for studying resume-aware RAG, agentic
orchestration and adaptive assessment.

## 3. Objectives

1. Extract a structured candidate profile from an uploaded resume and index it for semantic retrieval.
2. Generate interview questions that are grounded in the candidate's resume and target role (RAG), with source
   citations back to resume sections.
3. Orchestrate DSA, Technical, HR, Evaluation and Report agents through a LangGraph state graph controlled by a
   single orchestrator.
4. Evaluate every answer with a standard rubric (technical correctness 40 %, conceptual understanding 25 %,
   completeness 20 %, communication 15 %) and adapt the next question's difficulty from the score.
5. Support real-time voice interviews (speech-to-text → agent → text-to-speech) with a text fallback.
6. Persist every question, answer, score and difficulty decision; produce analytics dashboards and PDF reports.
7. Evaluate the system experimentally: question relevance, retrieval Precision/Recall@K, fixed vs adaptive
   difficulty, AI–human score agreement, latency and completion rate.

## 4. Existing system (before this work)

The repository contained a working FastAPI + React prototype with authentication, resume upload and ATS screening,
a WebSocket voice loop, three LLM interviewer agents and a PDF report. Its limitations (documented in
`PROJECT_AUDIT.md`) were: a LangGraph graph that was compiled but never executed; the resume stored as a single
vector with no chunking or retrieval during the interview; fixed difficulty; no per-question persistence;
fabricated fallback scores when the LLM failed; and a visually inconsistent frontend with simulated metrics.

## 5. Proposed system

| Component | Approach |
|---|---|
| Resume intelligence | PyMuPDF/python-docx parsing → LLM structured extraction (heuristic section parser fallback) → section-aware chunking → FAISS `IndexIDMap2` with per-candidate metadata |
| Question generation | Retrieval of top-k resume chunks per category → prompt with citations → LLM question (curated bank fallback), duplicate detection, follow-ups |
| Orchestration | LangGraph `StateGraph`: `entry → select_agent → {technical, hr, dsa}_agent`, `evaluate_answer → adapt_difficulty → {select_agent | conclude_round}`, `finalize_round`; shared `InterviewState`; orchestrator is the only controller |
| Evaluation | Evaluation agent returns structured JSON per rubric criterion with evidence quotes; aggregated per round; provenance flag (`llm` / `heuristic` / `unavailable`) |
| Adaptive engine | `DifficultyPolicy` with configurable thresholds (≤4 decrease, ≥8 increase) over `easy → medium → hard` |
| Voice | Deepgram STT, ElevenLabs TTS (Google TTS fallback), explicit interview states, turn ids, client-confirmed playback, text fallback |
| Persistence | PostgreSQL (SQLite for development): users, candidates, sessions (+config), round transcripts, interview questions, reports |
| Frontend | React 19 + Vite 6 + Tailwind design system: landing, auth, dashboard, resume analysis, interview setup, voice/text interview room, coding workspace, results, history, profile |

## 6. Methodology (summary)

Design-and-build with an audit-first approach: audit → fix correctness and data integrity → implement the three
technical contributions → redesign the UI against real APIs → test → run experiments → document. Details in
`METHODOLOGY.md`.

## 7. Technologies

Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, LangGraph 1.x, LangChain-core, Groq / Gemini LLM APIs, FAISS,
Google GenAI embeddings (with a local feature-hashing fallback), Deepgram, ElevenLabs, ReportLab, PyMuPDF, Pytest;
React 19, Vite 6, Tailwind CSS 3, Recharts, Monaco editor, Zustand, Axios.

## 8. Expected outcomes and deliverables

* A runnable application (backend + frontend) satisfying the acceptance criteria in the project brief.
* Three measurable technical contributions: resume-aware RAG question generation, LangGraph-based adaptive
  multi-agent interviewing, rubric-based evaluation and analytics.
* Experimental scripts and results (`backend/experiments/`, `EXPERIMENTAL_RESULTS.md`).
* Documentation set: audit, synopsis, architecture, database schema, API reference, methodology, results, testing
  report, future scope.

## 9. Scope and limitations

The system evaluates answers with an LLM judge and static code reasoning; it does not execute candidate code.
Without API keys it runs in a clearly flagged degraded mode (question bank, heuristic scoring, lexical embeddings).
Human-agreement results require a manually rated dataset (template provided) and are therefore reported as
"not yet run" until ratings are collected.
