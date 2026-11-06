# Testing Report

Date: 2026-11-06. Environment: Windows 11, Python 3.12.10, Node 20.10.0, no external API keys, no PostgreSQL
(SQLite development mode). All results below were obtained by actually running the listed commands.

## 1. Automated backend tests

Command: `cd backend && venv/Scripts/python -m pytest -q`
Result: **57 passed, 0 failed** (baseline before this work: 39 passed, 1 failed).

Test environment is fixed by `tests/conftest.py` (in-memory SQLite, hashing embeddings, LLM provider `none`,
isolated FAISS/upload directories), so the suite needs no network or keys.

| File | Scope | Tests |
|---|---|---|
| `test_adaptive_engine.py` (new) | Difficulty policy thresholds/clamping/disable, rubric weighting, evaluation agent LLM path and heuristic fallback, non-answer handling, round aggregation, category planning, question dedupe, generator LLM+RAG path and bank fallback, LangGraph open→answer→adapt→conclude→finalize | 13 |
| `test_rag.py` (new) | Section detection and chunk metadata, hashing embeddings determinism/normalisation, per-candidate retrieval isolation, re-index without duplicates, delete, FAISS persistence/reload with backend guard, metadata filter before top-k | 4 |
| `test_text_workflow.py` (rewritten) | Full text interview over WebSocket with the real orchestrator: turn ids, evaluation events, adaptive difficulty, automatic round conclusion, round/interview completion, DB persistence (questions, transcripts, session status), reconnection history | 1 |
| `test_agents.py`, `test_tech_agent_logic.py` | Legacy agent behaviours (DSA problem memory, tech opening question, HR opening, duplicate-question retry, fallback tiers) | 6 |
| `test_auth.py` | Password hashing, JWT creation/expiry, signup validation, invalid login | 5 |
| `test_strict_validation.py` | Signup/upload/DSA/WebSocket input validation | 5 |
| `test_file_uploads.py` | Magic-byte validation for PDF/DOCX, spoofed files | 1 |
| `test_rate_limiter.py` | Sliding window, exponential backoff, middleware integration, reset on success | 7 |
| `test_security_headers.py`, `test_error_handling.py`, `test_docs.py`, `test_data_deletion.py`, `test_new_services.py`, `test_basic.py` | Headers, correlation-id error responses, docs toggling, account deletion cleanup, STT/TTS/embedding service mocks, parser, WebSocket ping | 15 |

## 2. Live end-to-end smoke test (API + WebSocket)

Script: scratch `api_smoke.py` (httpx + websockets) against `uvicorn main:app` on a fresh SQLite database.
Steps and results (all **OK**):

1. `GET /api/system/status` — reports degraded mode honestly (llm unavailable, hashing embeddings, voice off).
2. Signup → access token + refresh cookie.
3. Upload a generated PDF resume → parsed (6 sections, 6 chunks indexed), heuristic screening flagged
   `screening_source=heuristic`, structured profile extracted heuristically.
4. Resume profile, RAG inspector retrieval (`projects` chunk ranked first for a CNN query, 1–2 ms).
5. Interview start with config `{rounds:[dsa,technical], questions_per_round:2, dsa_problems:1}` → persona assigned.
6. DSA problem (bank), hint, submission → recorded as `evaluation_source=unavailable` (not scored, never marked
   correct), round finalised, session advanced to `technical`.
7. WebSocket text round: `connected` → `start_round` → `ai_response` with turn id and question metadata
   (category `resume_projects`, difficulty `medium`, 2 retrieval sources) → answer → `answer_evaluated`
   (heuristic 3.44 → next difficulty `easy`) → second question at `easy` → `round_complete` → `interview_complete`.
8. History, dashboard overview (totals from the database), report JSON (narrative source `fallback`), PDF
   download (6.7 KB, `%PDF` header), PDF via `?token=` accepted, `?token=` rejected on a non-report route (401),
   legacy per-candidate report route, graph description endpoint.

Server log: 0 errors/tracebacks.

## 3. Frontend

* `npx eslint -f json src` → **0 findings** (the default `stylish` formatter crashes on Node 20.10 when it has
  something to print; the JSON formatter was used).
* `npx vite build` → **success** (Vite 6.4.5; 15 lazily loaded page chunks; largest vendor chunk is Recharts).
* Vite dev server starts and serves `/`.
* **Not verified:** rendering in a real browser (the Chrome automation extension was not connected in this session).
  Responsive behaviour and visual polish are therefore reasoned from the Tailwind implementation, not
  screenshot-verified. This is the main remaining manual check.

## 4. Experiments

`python experiments/run_all.py` completed; results in `backend/experiments/results/` (see
`EXPERIMENTAL_RESULTS.md`). Experiment 4 correctly reported `not_run` (no human ratings).

## 5. Defects found and fixed during testing

| Defect | Fix |
|---|---|
| `test_login_invalid_credentials` hit a real DB with no tables | Shared `conftest.py` creates the schema in an isolated in-memory DB |
| Upload test mocked only `screen`; non-awaitable `extract_structure` broke `asyncio.gather` | Screening and extraction failures are now handled independently |
| Gemini embedding test set the key after construction | Lazy client initialisation |
| SQLite returns naive datetimes → `TypeError` on duration arithmetic | `core/timeutil.seconds_between` used everywhere durations are computed |
| Heuristic screening rejected a valid resume (22 % keyword match) and blocked the whole flow | Heuristic screening is informational (section coverage + keywords) and only fails on no relevant content |
| Server not reloading after code change during smoke | Restart procedure documented; `--reload` recommended for development |

## 6. Not covered / recommended manual tests

* Voice pipeline with real Deepgram/ElevenLabs keys (microphone permission, barge-in, playback_finished timing).
* LLM path end-to-end with a Groq or Gemini key (question quality, JSON compliance, latency).
* PostgreSQL deployment: `alembic upgrade head` on an empty database and on a database created by the previous
  `create_all` + ad-hoc migrations.
* Browser walkthrough of every page at 375 px and 1280 px.
