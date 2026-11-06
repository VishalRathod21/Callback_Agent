# AI-Powered Personalized Mock Interview and Adaptive Candidate Evaluation System

**Callback Rehearsal – InterviewAI**

Callback Rehearsal is a full-stack mock-interview platform. A candidate uploads a resume, which is parsed, screened against a target role and chunked into a FAISS vector store. A LangGraph-orchestrated set of agents then runs a configurable multi-round interview (DSA coding, Technical, HR) in text or voice: every question is generated from the candidate's own resume and role, every answer is scored against a fixed four-criterion rubric, and the difficulty of the next question is adapted from the last score. Results are persisted per question, aggregated into a structured JSON + PDF report, and summarised on a progress dashboard. When external AI services are not configured the system keeps working in a clearly flagged degraded mode rather than inventing results.

---

## Contents

- [Key features](#key-features)
- [Degraded mode (no API keys)](#degraded-mode-no-api-keys)
- [Tech stack](#tech-stack)
- [Architecture overview](#architecture-overview)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Running the tests](#running-the-tests)
- [Running the experiments](#running-the-experiments)
- [Documentation](#documentation)
- [Security notes](#security-notes)
- [Academic context](#academic-context)

---

## Key features

- **Resume intelligence.** PDF/DOCX parsing (PyMuPDF, python-docx), ATS-style screening against the target role, structured profile extraction (skills, projects, experience, education, certifications), section-aware chunking (`RAG_CHUNK_SIZE`=600 chars, overlap 120) and per-candidate indexing in FAISS. A RAG inspector exposes the indexed chunks and lets you run retrieval queries (`/api/candidates/{id}/chunks`, `/retrieve`).
- **Resume-aware RAG question generation with citations.** Each technical/HR question is generated from retrieved resume chunks, the target role and an optional job description, across role-prioritised categories (Python, DSA, SQL/DBMS, ML, DL, NLP, Generative AI, LangChain/LangGraph, RAG, System Design, Resume Projects, HR). The chunks used are returned as `retrieval_sources` (`section#chunk_index`, relevance score, preview) on the WebSocket and stored with the question.
- **LangGraph-orchestrated agents.** One compiled `StateGraph` (`backend/agents/interview_graph.py`) drives every turn: `entry → select_agent → technical_agent | hr_agent | dsa_agent`, `evaluate_answer → adapt_difficulty → (select_agent | conclude_round)`, `finalize_round`. The orchestrator (`agents/orchestrator.py`) owns session state, persists each question/answer/evaluation and restores sessions from the database after a restart. `GET /api/interviews/engine/graph` returns the live topology.
- **Evaluation agent with a fixed rubric.** Every answer is scored 0–10 on `technical_correctness` (40 %), `conceptual_understanding` (25 %), `answer_completeness` (20 %) and `communication_clarity` (15 %) with feedback, strengths, gaps, evidence quotes, ideal answer points and learning topics. Weights are configurable (`RUBRIC_WEIGHT_*`, must sum to 1.0).
- **Adaptive difficulty policy.** Difficulty moves on the ladder `easy → medium → hard` from the latest overall score: `≤ ADAPTIVE_DECREASE_MAX` (default 4) decreases, `≥ ADAPTIVE_INCREASE_MIN` (default 8) increases, in between maintains. Switch off globally (`ADAPTIVE_ENABLED=false`) or per session (`adaptive: false`). Each decision is recorded with its reason (`policy_decision`).
- **Configurable interviews.** Rounds subset, starting difficulty, voice/text mode, 2–12 questions per round, 1–4 DSA problems, duration, job description, RAG on/off; defaults come from settings. A random interviewer persona (5 presets) is attached to each session.
- **DSA coding round.** Runs in a Monaco code editor over REST (`/api/interviews/{sid}/dsa/problem|hint|submit`) with resume-aware problem selection, adaptive difficulty between problems, hints, and LLM-based static evaluation (correctness, complexity, edge cases). Code is not executed.
- **Voice interview loop.** WebSocket protocol with explicit states (`initializing, listening, processing, generating, speaking, waiting, completed, error`), per-turn ids, client `playback_finished` acknowledgement, Deepgram STT (`nova-2`), ElevenLabs TTS with a Google TTS fallback when the ElevenLabs key is missing, and a typed-text fallback at any point.
- **Reports and analytics.** Structured report JSON (per-round, per-question, rubric averages, skill performance, difficulty trace, evaluation provenance, narrative) cached per session and rendered to a multi-page ReportLab PDF. Dashboard endpoints compute readiness score, trends, weak areas and rubric averages from persisted data only.
- **Auxiliary modes.** Quick-practice sessions (DSA theory / system design / behavioural / random) with instant feedback, and a post-interview debrief chat grounded in the latest completed session.
- **Account management.** Signup/login with Argon2 hashing, short-lived JWT access tokens, rotating HttpOnly refresh tokens with reuse detection, per-device token records, preferences, profile update, password change/reset flow, full account deletion (database rows, uploaded files and vectors).

## Degraded mode (no API keys)

The application starts and is usable without any external key. What changes, and how it is flagged:

| Missing | Behaviour | Flag |
|---|---|---|
| `GROQ_API_KEY` (or `GEMINI_API_KEY` with `LLM_PROVIDER=gemini`) — **no LLM** | Questions come from a curated question bank instead of being generated; answers are scored by a lexical heuristic (length, structure, overlap with the question's key terms). The heuristic **cannot verify correctness**, so `technical_correctness`/`conceptual_understanding` are capped at 6 and the feedback text says so. Empty or "I don't know" answers are `unavailable` (all zeros). DSA submissions are recorded but **not scored** (`overall_score: null`). Resume screening and structure extraction fall back to keyword/section heuristics that only report skills literally present in the resume. Report narratives use a deterministic summary. | `generation_source: "bank"`, `evaluation_source: "heuristic"` / `"unavailable"`, `screening_source`/`extraction_source: "heuristic"`, `narrative_source: "fallback"`; `/api/system/status → llm.available=false`; counts in `evaluation_provenance` on dashboards and reports |
| `GEMINI_API_KEY` — **no semantic embeddings** | `EMBEDDING_BACKEND=auto` selects the local **hashing** backend (feature-hashed unigrams, bigrams and character trigrams, 768-d). Retrieval is lexical: paraphrases without shared vocabulary will not match. | `/api/system/status → embeddings.backend="hashing"`; `backend` field on chunk/retrieve responses; experiment results record the backend used |
| `DEEPGRAM_API_KEY` | Speech-to-text disabled; a session requested in `voice` mode is created with `config.voice_available=false` and runs as text. | `connected.voice_enabled=false`, `/api/interviews/config/options → voice_available` |
| `ELEVENLABS_API_KEY` (with `VOICE_ENABLED=true`) | TTS falls back to Google TTS; if synthesis fails the interview continues in text. | `/api/system/status → voice.tts` |
| `JWT_SECRET_KEY` | A random secret is generated at start-up; all sessions are invalidated on restart. | startup warning `CONFIG: JWT_SECRET_KEY is not set` |
| PostgreSQL | SQLite file database is used (`interviewai_dev.db`). | `/api/system/status → database="sqlite"` |

Set `STRICT_STARTUP=true` (default in `ENVIRONMENT=production`) to make a missing LLM key or JWT secret abort start-up instead.

## Tech stack

| Layer | Technology (pinned in `backend/requirements.txt` / `frontend/package.json`) |
|---|---|
| API | Python 3.11, FastAPI 0.137, Uvicorn, Pydantic 2 / pydantic-settings, SQLAlchemy 2.0 (async), Alembic 1.18 |
| Database | PostgreSQL 16 (asyncpg) in production; SQLite (aiosqlite) for development and tests |
| Agents / LLM | LangGraph 1.2, langchain-core, Groq SDK (`llama-3.3-70b-versatile` + fallback models), `google-genai` (Gemini provider and `text-embedding-004` embeddings) |
| Retrieval | FAISS (`faiss-cpu`), local hashing embeddings fallback |
| Documents | PyMuPDF, python-docx (parsing); ReportLab (PDF reports) |
| Voice | Deepgram SDK (STT), ElevenLabs SDK (TTS) with Google TTS fallback |
| Auth | PyJWT (HS256), argon2-cffi, email-validator |
| Frontend | React 19, Vite 6, Tailwind CSS 3, react-router 7, zustand, axios, Recharts, Monaco editor (`@monaco-editor/react`), framer-motion, lucide-react |
| Dev / research | pytest + pytest-asyncio, httpx, pandas, scikit-learn, scipy, matplotlib |

## Architecture overview

```mermaid
graph LR
    subgraph Frontend["React / Vite SPA (port 5173)"]
        Pages["Pages: Resume · InterviewSetup · InterviewRoom · DSARound · Results · Dashboard · History · Practice · Profile"]
        Axios["axios client (JWT, silent refresh)"]
        WSHook["useWebSocket / useAudioCapture"]
    end

    subgraph Backend["FastAPI (port 8002)"]
        REST["REST routers<br/>/api/auth · candidates · interviews · dsa · reports · dashboard · debrief · practice"]
        WS["WebSocket /ws/interview/{id}<br/>state machine + turn ids"]
        MW["Middleware: CORS · security headers · rate limiting"]
        Orch["InterviewOrchestrator<br/>session state · persistence · restore"]
        Graph["LangGraph StateGraph<br/>select_agent → technical/hr/dsa agent<br/>evaluate_answer → adapt_difficulty → conclude/finalize"]
        QG["QuestionGenerator (RAG + question bank)"]
        Eval["EvaluationAgent (rubric 40/25/20/15)"]
        Policy["DifficultyPolicy"]
        DSA["DSAInterviewAgent"]
        Report["ReportAgent (JSON + ReportLab PDF)"]
        Screener["ResumeScreenerAgent"]
        RAG["RAGService → FAISSService"]
        LLM["LLMService (Groq | Gemini | none)"]
        STT["Deepgram STT"]
        TTS["ElevenLabs TTS / Google fallback"]
    end

    subgraph Storage
        PG[("PostgreSQL / SQLite<br/>users · candidates · interview_sessions<br/>round_transcripts · interview_questions · interview_reports")]
        FAISS[("FAISS index<br/>faiss_store/")]
        Files[("uploads/<candidate_id>/<br/>resume + report PDF")]
    end

    Pages --> Axios --> MW --> REST
    WSHook --> WS
    REST --> Orch
    WS --> Orch
    Orch --> Graph
    Graph --> QG --> RAG
    Graph --> Eval --> Policy
    REST --> DSA
    REST --> Report
    REST --> Screener --> RAG
    QG --> LLM
    Eval --> LLM
    DSA --> LLM
    Report --> LLM
    WS --> STT
    WS --> TTS
    Orch --> PG
    REST --> PG
    RAG --> FAISS
    REST --> Files
```

Request flow for one interview turn: the client sends an answer over the WebSocket → the orchestrator runs the graph with `phase="answer"` → `evaluate_answer` retrieves up to two resume chunks for context and scores the answer → `adapt_difficulty` applies the policy → `check_progress` either routes back to the round agent (which generates the next question with RAG context) or to `conclude_round` → the orchestrator persists the question rows → the WebSocket emits `answer_evaluated`, then `ai_response` (+ `ai_audio` in voice mode).

## Repository layout

```
Callback_Agent/
├── README.md, API_DOCUMENTATION.md, DATABASE_SCHEMA.md, PROJECT_AUDIT.md
├── docker-compose.yml            # PostgreSQL 16 on host port 5433
├── start_dev.sh / stop_dev.sh    # bash helpers (macOS/Linux): compose up, venv, alembic, uvicorn, vite
├── backend/
│   ├── main.py                   # FastAPI app, lifespan (schema, services), middleware, health/system routes
│   ├── requirements.txt, requirements-dev.txt
│   ├── .env.example              # copy to .env
│   ├── alembic.ini, alembic/     # migrations: 81db495860f2 → ff35ecccfbc1 → a1b2c3d4e5f6
│   ├── Dockerfile, render.yaml, run.sh
│   ├── api/
│   │   ├── routes/               # auth, candidates, interviews, dsa, reports, dashboard, debrief, practice
│   │   └── websocket.py          # /ws/interview/{session_id} protocol and state machine
│   ├── agents/
│   │   ├── interview_graph.py    # LangGraph StateGraph + InterviewState
│   │   ├── orchestrator.py       # session lifecycle, persistence, restore, personas, config normalisation
│   │   ├── question_generator.py # RAG question generation, categories, question bank
│   │   ├── evaluation_agent.py   # rubric scoring, heuristic fallback, round aggregation
│   │   ├── difficulty_policy.py  # adaptive policy
│   │   ├── dsa_agent.py, tech_agent.py, hr_agent.py
│   │   ├── resume_screener.py, report_agent.py, debrief_agent.py, practice_agent.py
│   ├── core/                     # config (settings), database, models, schemas, security, timeutil, communication_analyzer
│   ├── services/
│   │   ├── llm_service.py        # Groq / Gemini providers, LLMUnavailableError
│   │   ├── rag_service.py, faiss_service.py, resume_chunker.py, resume_parser.py
│   │   ├── embeddings/           # gemini_embeddings.py, hashing_embeddings.py
│   │   ├── stt/deepgram_service.py, tts/elevenlabs_service.py
│   │   └── rate_limiter.py
│   ├── experiments/              # exp1–exp5 scripts, common.py, human_ratings.csv, run_all.py, results/
│   ├── tests/                    # pytest suite (conftest sets TESTING/SQLite/hashing/no LLM)
│   ├── faiss_store/, uploads/    # runtime data (created on demand)
│   └── interviewai_dev.db        # SQLite dev database (created on first run)
└── frontend/
    ├── package.json, vite.config.js, tailwind.config.js, postcss.config.js, eslint.config.js, vercel.json
    └── src/
        ├── App.jsx, main.jsx     # routes: /, /signin, /signup, /dashboard, /resume, /interview/setup,
        │                         #   /interview/:sessionId, /interview/:sessionId/dsa, /results/:sessionId,
        │                         #   /history, /profile, /practice, ...
        ├── api/client.js, api/endpoints.js
        ├── hooks/useWebSocket.js, hooks/useAudioCapture.js
        ├── context/AuthContext.jsx, store/interviewStore.js
        ├── pages/, components/ (layout, ui), styles/tokens.css
```

## Quick start

Prerequisites: Python 3.11, Node.js ≥ 20.10 (Vite 6), optionally Docker for PostgreSQL. No API keys are required to run (see [Degraded mode](#degraded-mode-no-api-keys)).

### Backend

```bash
cd backend
python -m venv venv
# Windows (PowerShell / cmd)
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt        # tests + experiments (pytest, pandas, scikit-learn, matplotlib, aiosqlite ...)

cp .env.example .env                       # Windows: copy .env.example .env
```

Edit `.env`. For the SQLite default, **remove or comment out** the `DATABASE_URL` line from `.env.example` (it points at a PostgreSQL URL) or set it explicitly:

```
DATABASE_URL=sqlite+aiosqlite:///./interviewai_dev.db
```

Add `GROQ_API_KEY` (and optionally `GEMINI_API_KEY` for semantic embeddings) to leave degraded mode. Set a real `JWT_SECRET_KEY`.

Run the API:

```bash
uvicorn main:app --reload --port 8002
```

The lifespan hook creates missing tables (`create_all`), initialises the FAISS store and logs any configuration warnings. Visit `http://localhost:8002/health` and `http://localhost:8002/api/system/status`. Set `ENABLE_DOCS=true` to get Swagger at `/docs`.

#### PostgreSQL instead of SQLite

```bash
docker compose up -d                       # postgres:16, user postgres / password, db interviewai, host port 5433
# in backend/.env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/interviewai
cd backend && alembic upgrade head         # applies 81db495860f2 → ff35ecccfbc1 → a1b2c3d4e5f6
uvicorn main:app --reload --port 8002
```

On PostgreSQL the start-up hook additionally runs an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` list (`POSTGRES_MIGRATIONS` in `main.py`) so databases created before the Alembic chain was completed keep working. See `DATABASE_SCHEMA.md` for details.

`start_dev.sh` (bash) performs the compose/venv/alembic/uvicorn/vite sequence in one go on macOS/Linux; `stop_dev.sh` reverses it.

### Frontend

```bash
cd frontend
npm install
npm run dev                                # http://localhost:5173
```

The API base URL and WebSocket URL default to `http://localhost:8002/api` and `ws://localhost:8002` when the page is served from `localhost`; otherwise they default to the page's own host. Override with environment variables in `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8002/api
VITE_WS_URL=ws://localhost:8002
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

### First walkthrough

1. Sign up at `/signup` (password needs upper, lower and digit; 8+ chars).
2. Upload a resume (`/resume`) with name, e-mail and target role — the screening decision and extraction source are shown.
3. Configure an interview (`/interview/setup`): rounds, difficulty, mode, questions per round.
4. The DSA round opens the coding workspace; technical/HR rounds open the interview room (WebSocket).
5. Open `/results/:sessionId` for the report (JSON view + PDF download) and `/dashboard` for aggregates.

## Environment variables

All keys are defined in `backend/core/config.py` (`pydantic-settings`, read from `backend/.env`; unknown keys ignored).

### Runtime

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | `development` \| `production` \| `test`. Drives `is_production`, cookie `Secure`, strict start-up default. |
| `STRICT_STARTUP` | `None` → true in production | Abort start-up when the LLM key or JWT secret is missing, or when SQLite is used in production. |
| `PORT` | `8002` | Informational (uvicorn port is passed on the command line; `render.yaml` uses `$PORT`). |
| `ENABLE_DOCS` | `false` | Serve `/docs`, `/redoc`, `/openapi.json`. |

### LLM providers

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `groq` | `groq` \| `gemini` \| `none`. |
| `GROQ_API_KEY` | `""` | Groq key; placeholder values starting with `gsk_your_` count as unset. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Primary Groq model. |
| `GROQ_FALLBACK_MODELS` | `llama-3.3-70b-versatile,qwen/qwen3-32b,llama3-8b-8192` | Comma-separated fallbacks tried in order. |
| `GEMINI_API_KEY` | `""` | Gemini key (LLM when `LLM_PROVIDER=gemini`; also enables Gemini embeddings). `your_key_here` counts as unset. |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini chat model. |
| `LLM_TIMEOUT_SECONDS` | `30.0` | Per-call timeout (retried with backoff up to 3 attempts). |

### Embeddings / RAG

| Variable | Default | Purpose |
|---|---|---|
| `EMBEDDING_BACKEND` | `auto` | `gemini` \| `hashing` \| `auto` (gemini when a key is set, else hashing). |
| `EMBEDDING_DIM` | `768` | Vector dimension (matches `text-embedding-004`; also used by the hashing backend). |
| `RAG_CHUNK_SIZE` | `600` | Chunk size in characters. |
| `RAG_CHUNK_OVERLAP` | `120` | Chunk overlap in characters. |
| `RAG_TOP_K` | `4` | Default number of chunks retrieved. |
| `RAG_MIN_SCORE` | `0.05` | Drop hits below this similarity. |
| `FAISS_PERSIST_DIR` | `./faiss_store` | Index directory. |
| `FAISS_INDEX_PATH` | `""` | Alias of `FAISS_PERSIST_DIR` (whichever is set wins). |

### Voice

| Variable | Default | Purpose |
|---|---|---|
| `VOICE_ENABLED` | `false` | Load STT/TTS services at start-up. |
| `DEEPGRAM_API_KEY` | `""` | Deepgram STT key (required for voice input). |
| `DEEPGRAM_MODEL` | `nova-2` | Deepgram model. |
| `ELEVENLABS_API_KEY` | `""` | ElevenLabs TTS key; missing → Google TTS fallback. |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice. |

### Storage

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./interviewai_dev.db` | SQLAlchemy async URL; `postgresql://` is rewritten to `postgresql+asyncpg://`. |
| `UPLOAD_DIR` | `./uploads` | Resume files and generated PDFs, one folder per candidate id. |

### HTTP

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins. |
| `FRONTEND_URL` | `""` | Extra origin appended to the CORS list. |

### Auth

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET_KEY` | `""` | HS256 signing key. Falls back to `SECRET_KEY`, then to a random per-process secret (flagged). |
| `SECRET_KEY` | `""` | Legacy alias used when `JWT_SECRET_KEY` is unset/placeholder. |
| `JWT_SECRET_IS_FALLBACK` | `false` | Set automatically when a random secret was generated; do not set by hand. |
| `JWT_ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access-token lifetime. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh-token lifetime. |
| `REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS` | `90` | Lifetime with `remember_me=true`. |
| `COOKIE_SECURE` | `None` → true in production | `Secure` flag on the refresh cookie. |

### Interview engine

| Variable | Default | Purpose |
|---|---|---|
| `ADAPTIVE_ENABLED` | `true` | Global switch for the adaptive policy. |
| `ADAPTIVE_DECREASE_MAX` | `4.0` | Score ≤ this → decrease difficulty. Must be < `ADAPTIVE_INCREASE_MIN`. |
| `ADAPTIVE_INCREASE_MIN` | `8.0` | Score ≥ this → increase difficulty. |
| `DEFAULT_QUESTIONS_PER_ROUND` | `5` | Default when the client does not specify. |
| `MAX_QUESTIONS_PER_ROUND` | `12` | Upper clamp. |
| `DEFAULT_DSA_PROBLEMS` | `2` | Default DSA problems per round (clamped 1–4). |
| `RUBRIC_WEIGHT_TECHNICAL` | `0.40` | Weight of `technical_correctness`. |
| `RUBRIC_WEIGHT_CONCEPTUAL` | `0.25` | Weight of `conceptual_understanding`. |
| `RUBRIC_WEIGHT_COMPLETENESS` | `0.20` | Weight of `answer_completeness`. |
| `RUBRIC_WEIGHT_COMMUNICATION` | `0.15` | Weight of `communication_clarity`. The four weights must sum to 1.0 or start-up fails. |

### Rate limiting

| Variable | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Enable the middleware. |
| `RATE_LIMIT_PUBLIC_LIMIT` / `RATE_LIMIT_PUBLIC_WINDOW` | `30` / `60` | Unauthenticated requests per IP per window (s). |
| `RATE_LIMIT_USER_LIMIT` / `RATE_LIMIT_USER_WINDOW` | `100` / `60` | Authenticated requests per user per window (s). |
| `RATE_LIMIT_AUTH_IP_LIMIT` / `RATE_LIMIT_AUTH_IP_WINDOW` | `5` / `60` | Signup/login/verify attempts per IP. |
| `RATE_LIMIT_AUTH_ACCOUNT_LIMIT` / `RATE_LIMIT_AUTH_ACCOUNT_WINDOW` | `5` / `60` | Same per account e-mail. |
| `RATE_LIMIT_AUTH_BACKOFF_BASE` / `_FACTOR` / `_MAX` | `2.0` / `2.0` / `300.0` | Exponential backoff after violations (seconds). |
| `RATE_LIMIT_AUTH_COOLDOWN` | `3600.0` | Seconds of inactivity before the violation counter resets. |
| `RATE_LIMIT_UPLOAD_LIMIT` / `RATE_LIMIT_UPLOAD_WINDOW` | `10` / `3600` | Resume uploads per user per window. |
| `TRUSTED_PROXY` | `false` | Trust `X-Forwarded-For` / `X-Real-IP` for client IP (only behind a reverse proxy). |

`backend/.env.example` lists a subset of these with placeholder values.

## Running the tests

```bash
cd backend
# Windows
venv\Scripts\python -m pytest
# macOS / Linux
venv/bin/python -m pytest
```

`tests/conftest.py` sets its own environment before the app is imported: `TESTING=true`, `ENVIRONMENT=test`, in-memory SQLite, `EMBEDDING_BACKEND=hashing`, `LLM_PROVIDER=none`, `VOICE_ENABLED=false`, isolated FAISS and upload directories, and rate limiting enabled. No `.env`, database server or API keys are needed. Test modules cover the adaptive engine, agents, auth, data deletion, docs toggling, error handling, file uploads, RAG, the rate limiter, security headers, strict start-up validation, tech-agent logic and the text interview workflow.

## Running the experiments

```bash
cd backend
venv/Scripts/python experiments/run_all.py      # Windows
venv/bin/python experiments/run_all.py          # macOS / Linux
```

`run_all.py` runs, in order, `exp1_generic_vs_resume.py` (question relevance by generation condition), `exp2_rag_retrieval.py` (Precision@K / Recall@K for section-aware vs naive chunking), `exp3_fixed_vs_adaptive.py` (policy simulation: Spearman ρ, mean absolute error, time at target level), `exp4_human_agreement.py` (AI vs human ratings from `experiments/human_ratings.csv`) and `exp5_latency.py` (generation/evaluation latency by source), then plots PNGs. Outputs land in `backend/experiments/results/` as `expN_*.json` and `*.png`. Each JSON records an `environment` block (LLM provider availability, embedding backend) so offline and live-LLM runs are never confused. Extra command-line arguments are forwarded to `exp5_latency.py`. The scripts run fully offline by default (`experiments/common.py` sets `TESTING=true` and an in-memory database).

## Documentation

| Document | Content |
|---|---|
| [`API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) | Every REST endpoint, the WebSocket protocol and state machine, rate limits, provenance fields, examples |
| [`DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Tables, enums, constraints, ER diagram, JSON column structures, migration strategy, example queries |
| [`PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md) | Baseline audit of the repository before the current iteration, with the prioritised fix list |
| [`PROJECT_SYNOPSIS.md`](docs/PROJECT_SYNOPSIS.md) | Project synopsis (problem statement, objectives, scope) |
| [`SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md) | Component and sequence diagrams, LangGraph topology |
| [`METHODOLOGY.md`](docs/METHODOLOGY.md) | RAG pipeline, rubric, adaptive policy, evaluation protocol |
| [`EXPERIMENTAL_RESULTS.md`](docs/EXPERIMENTAL_RESULTS.md) | Results of `experiments/run_all.py` with the environment they were produced in |
| [`TESTING_REPORT.md`](docs/TESTING_REPORT.md) | Test strategy and results |
| [`FUTURE_SCOPE.md`](docs/FUTURE_SCOPE.md) | Limitations and planned work |

All project documentation lives in the [`docs/`](docs/) folder, including the full project report (`docs/Project_Report.docx` / `docs/Project_Report.pdf`).

## Security notes

- **Never commit `.env`.** `.gitignore` excludes `.env`, `backend/.env` and `frontend/.env*`. Rotate any key that was ever committed.
- Set a real `JWT_SECRET_KEY` (e.g. `python -c "import secrets; print(secrets.token_hex(32))"`). Without it a random secret is used and every restart logs all users out.
- Access tokens are expected in the `Authorization: Bearer` header. A `?token=` **query-string token is accepted only on the report PDF download routes** (`/api/reports/session/{id}/pdf`, `/api/reports/{candidate_id}`), where browsers cannot set headers; it is ignored everywhere else so tokens do not leak into logs through ordinary calls. The WebSocket uses `?token=` as well.
- Refresh tokens are random, stored only as SHA-256 hashes, delivered as `HttpOnly` cookies scoped to `/api/auth`, and **rotated on every refresh**; presenting an already-used or expired token wipes all refresh tokens for that user. Use `POST /api/auth/logout-all` to revoke every device.
- Passwords are hashed with Argon2; password-reset tokens expire after 15 minutes and are **only written to the server log** (there is no e-mail delivery in this project).
- Rate limiting is in-memory and per process; behind a reverse proxy set `TRUSTED_PROXY=true` so limits apply to the real client IP, and keep it `false` otherwise to prevent header spoofing.
- Keep `ENABLE_DOCS=false` in production. Set `ENVIRONMENT=production` to enable HSTS semantics, `Secure` cookies and strict start-up.
- Uploaded resumes are validated by extension, size (5 MB) and file signature, and stored under `UPLOAD_DIR/<candidate_id>/`. Deleting a candidate or account removes these files and the corresponding FAISS vectors.

## Academic context

This repository is the minor project for the M.Tech Integrated programme in Artificial Intelligence & Data Science. Its research contributions are the resume-grounded RAG question generation with source citations, the rubric-based evaluation agent with explicit provenance of every score, the configurable adaptive difficulty policy, and the LangGraph orchestration that routes between specialised interview agents over a shared state — together with the offline-reproducible experiments in `backend/experiments/` that evaluate them. All reported numbers must be read together with the `environment` block of the corresponding results file, which states whether a live LLM and semantic embeddings were available when they were produced.
