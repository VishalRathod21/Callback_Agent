# PROJECT AUDIT — Callback Rehearsal / InterviewAI

Audit date: 2026-11-06
Scope: full repository (`backend/`, `frontend/`, infra scripts) as found at commit `4815096`.
Method: every backend module, route, agent, service, test and alembic revision was read in full; frontend
pages, hooks, API client and design tokens were read; the backend test suite was executed; a SQLite
compatibility probe was run; the frontend build was attempted.

Baseline measurements (before any change):

| Check | Result |
|---|---|
| Backend tests (`pytest`, TESTING=true) | 39 passed, 1 failed (`test_login_invalid_credentials`, pre-existing: `get_db` is patched after import so the real in-memory SQLite is used and has no tables) |
| Frontend build (`vite build`) | Fails on this machine: Vite 8 requires Node 20.19+, installed Node is 20.10 |
| Local PostgreSQL / Docker | Not available on the development machine; the app only has an in-memory SQLite default |
| `.env` | Absent (only `.env.example`) |

---

## 1. Existing working features

Backend
- **Authentication**: signup, login, logout, logout-all, refresh-token rotation (hashed refresh tokens in DB, HttpOnly cookie, reuse detection wipes all tokens), `/me` read/update/delete, change/forgot/reset password, email-verification token flow (token is only logged, no mailer). Argon2 password hashing, PyJWT HS256.
- **Rate limiting middleware** (`services/rate_limiter.py`): sliding window for public/user traffic, exponential backoff for auth paths, upload limit per user. Covered by tests.
- **Resume upload** (`POST /api/candidates/upload`): extension + magic-byte validation, 5 MB limit, PyMuPDF/python-docx parsing, LLM ATS screening + structured extraction in parallel, candidate record creation, FAISS insert.
- **Interview session creation** (`POST /api/interviews/start/{candidate_id}`), session read, DSA REST flow (`/problem`, `/hint`, `/submit`) with per-problem `RoundTranscript` rows.
- **WebSocket interview loop** (`/ws/interview/{session_id}`): JWT auth via query param, ownership check, pydantic validation of every inbound message, text and audio turns, Deepgram STT, ElevenLabs TTS with Google-Translate fallback, round evaluation and DB persistence on `end_round`, reconnection history replay.
- **Technical / HR agents**: multi-turn LLM interviewers with duplicate-question detection (tech), per-answer intermediate evaluations kept in memory, end-of-round rubric evaluation, filler-word communication analysis.
- **Report agent**: LLM narrative + ReportLab multi-page PDF; JSON report endpoint for the UI.
- **Dashboard endpoint**: readiness score, trends and weak-area analysis from completed sessions.
- **Quick practice** and **debrief chat** endpoints and agents.
- **Security headers middleware**, generic exception handlers with correlation ids, CORS configuration.

Frontend
- Routing, `AuthContext` with silent refresh and a refresh mutex in the axios interceptor, protected routes.
- Working pages wired to real endpoints: SignIn/SignUp/Forgot/Reset/VerifyEmail, Upload, Lobby, InterviewRoom, DSARound (Monaco editor), Report (JSON + PDF download), Dashboard, QuickPractice, DebriefChat.
- `useAudioCapture` (MediaRecorder + RMS silence detection) and `useWebSocket` (sequential audio queue, reconnection with permanent-close-code guard).

## 2. Partially implemented features

| Area | What exists | What is missing |
|---|---|---|
| LangGraph orchestration | A `StateGraph` is built and compiled in `agents/orchestrator.py` | The compiled graph is **never invoked**. `start_session` and `submit_round_result` step through node functions by hand. No conditional routing between agents, no shared-state agent selection. |
| RAG | Whole resume stored as **one** FAISS vector, `search()` exists | No chunking, no per-candidate filtering in agents, no retrieval during interviews (agents use `resume_structured` JSON directly). `search()` is not called anywhere in the interview path. Metadata filter is applied after over-fetching 3×k, which can return fewer than k results. |
| Embeddings | Gemini `text-embedding-004` only | No fallback when `GEMINI_API_KEY` is missing: `embed_batch` returns `[[]]`, `np.array` becomes shape `(1,0)` and `faiss.add` raises. Resume storage silently fails with Groq-only configuration. |
| Adaptive difficulty | Tech agent has a fixed tier by question count; DSA difficulty is fixed by problem index | No score-driven adaptation, no configurable thresholds, no structured per-answer rubric (`technical_correctness / conceptual_understanding / completeness / communication`). |
| Interview configuration | Rounds hard-coded to `["dsa","technical","hr"]`, DSA total hard-coded to 2, tech limit 5-6 questions, HR 4 | No UI or API to choose rounds, difficulty, mode, duration or question count. |
| Reports | PDF + narrative | No question-wise feedback, no suggested learning topics, no per-rubric breakdown, no persisted report record; report lookup uses `candidate.sessions[-1]` (undefined ordering) instead of a session id. |
| Session persistence | `restore_session` rebuilds orchestrator state from DB | `asked_topics`, conversation history, current DSA problem and difficulty are lost on restart; the WebSocket `active_sessions` dict is separate from orchestrator state. |
| Gemini provider | `GeminiProvider` class exists | Imports `google.generativeai`, which is not in `requirements.txt` (`google-genai` is). Selecting `LLM_PROVIDER=gemini` crashes at startup. |
| Alembic | Two revisions | Revision `ff35ecccfbc1` drops a FK (`candidates_user_id_fkey`) that no prior revision created, and the `users`/`refresh_tokens` tables are never created by any revision. `alembic upgrade head` on a fresh DB fails. The app relies on `create_all` + ad-hoc `ALTER TABLE` in `main.py`. |

## 3. Broken features and bugs

1. **Fabricated evaluation scores on LLM failure.** `TechInterviewAgent.evaluate_round` returns a hard-coded 85/100 with invented strengths; `HRInterviewAgent.evaluate_round` returns 88/100 with "Recommend hire"; `DSAInterviewAgent._get_fallback_evaluation` returns `correct: True, overall_score: 80` for any code; `_fallback_screening` returns a minimum ATS of 65% and invents matched skills (`"System Architecture", "Git", "Clean Code"`) when none match. These values are persisted and shown as real results.
2. **Candidate takeover across users.** Upload looks up `Candidate` by email only; if another user already uploaded with that email, the record (and all its sessions, which are cleared) is reassigned to the current user.
3. **FAISS write path crashes without Gemini key** (see §2) — logged and swallowed, so resumes are never retrievable for RAG in a Groq-only setup.
4. **Report endpoints read `./uploads` literally** instead of `settings.UPLOAD_DIR`.
5. **TTS audio labelled `format: "wav"`** while ElevenLabs returns MP3 (and the Google fallback also returns MP3). Works only because `decodeAudioData` sniffs the container.
6. **Fixed sleep after TTS** (`len(words) * 400 ms`) decides when the server switches to listening, independent of actual playback; the client may still be playing or have finished long before.
7. **Race in audio turn handling**: `silence_detected` and `candidate_text` are processed without a per-session lock; two quick events can trigger two agent calls and two `ai_response` messages.
8. **Orchestrator `rounds_queue` on restore is derived from `current_round` only**; a configured subset of rounds cannot be restored.
9. **`get_dashboard` compares enum column to string** `"completed"`; works on PostgreSQL only by luck of enum value naming and breaks on SQLite.
10. **`InterviewRoom` shows randomised fake telemetry** (`confidence`, `pacing`, `clarity`, `latency` generated by `Math.random` every 2.5 s) presented as live metrics.
11. **Upload page uses hard-coded timers** (2 s and 4.2 s) to fake "scanning/extracting" phases regardless of real request progress; `SUGGESTED_REWRITES` are static strings shown as if generated for the user.
12. **Lobby derives screening reasoning from status only** ("Resume did not meet target qualifications.") instead of the stored reasoning.
13. **`Report.jsx` builds a fake report** (`rounds: []`, canned narrative) if `/reports/{id}/data` fails.
14. **Frontend build is broken on Node < 20.19** (Vite 8). 
15. **`test_login_invalid_credentials`** fails (dependency patched after import).
16. **Tech agent has two divergent code paths** (`resume_text` legacy vs `resume_structured` new) with different output schemas; the new path returns no per-answer evaluation, so the end-of-round evaluation ignores intermediate scores.
17. **`_get_resume_text` imported with a different signature** in `websocket.py` (`_get_resume_text(cand_db)` vs definition `(candidate, faiss_service)`) → `TypeError` caught and logged, resume context never loaded on that path.
18. `restore_session` creates a **new `FAISSService()`** (re-initialising the Gemini client) per call instead of using `app.state.faiss`.
19. `datetime.utcnow()` (naive) is stored into timezone-aware columns in `practice.py`.
20. Candidate `name` regex rejects legitimate names with dots or non-Latin letters.

## 4. Missing functionality (against the project requirements)

- Interview configuration (role, type, difficulty, duration, voice/text mode, question count).
- Resume analysis dashboard (skills, projects, experience, education, profile overview) and `GET` endpoint exposing `resume_structured`.
- Chunked, metadata-rich RAG with per-candidate filtering and source references returned to agents and UI.
- Resume-aware question categories (Python, DSA, SQL/DBMS, ML, DL, NLP, GenAI, LangChain/LangGraph, RAG, System Design, Resume Projects, HR).
- Evaluation agent with the standard rubric and `next_difficulty`; difficulty policy with configurable thresholds.
- Report agent producing: duration, question count, per-round and per-question scores, strengths/weaknesses, recommendations, learning topics.
- Question-level persistence (question, answer, difficulty, rubric scores, retrieval sources).
- Interview history page and API (list of sessions for the current user).
- Profile & settings page (uses existing `/auth/me` PATCH, change-password, delete).
- Explicit interview states (`initializing, listening, processing, generating, speaking, waiting, completed, error`).
- Experimental evaluation scripts and documentation set (synopsis, architecture, schema, API, methodology, results, testing, future scope).
- Automated tests for: adaptive policy, evaluation agent, RAG chunking/retrieval, orchestrator graph, new endpoints.

## 5. Security issues

| Severity | Issue |
|---|---|
| High | Candidate record takeover by email (§3.2). |
| Medium | Access token accepted via `?token=` query string on every route (needed for PDF download) — tokens leak into server logs/browser history. Restrict to the PDF route or use a short-lived download token. |
| Medium | `Content-Security-Policy: default-src 'self'` is emitted by the **API** server; harmless but meaningless. HSTS is sent even on plain HTTP localhost. |
| Medium | WebSocket auth is skipped entirely when `pytest` is imported (`is_testing`) — acceptable for tests, but the flag is derived from `sys.modules`, which any co-loaded module could trigger. |
| Low | Refresh-cookie `secure` flag is derived from `DATABASE_URL` string content rather than an explicit `ENVIRONMENT` setting. |
| Low | `ENABLE_DOCS` default false is correct; `GET /` advertises `/docs` regardless. |
| Low | Forgot-password tokens are written to logs at INFO level (intentional dev behaviour, must be documented). |
| Info | Secrets are not committed; `.env.example` present; `.gitignore` covers `.env`. |

## 6. UI/UX problems

- Three different visual languages coexist: "Midnight Obsidian" tokens, "museum/aurora/volumetric" glass overlays, and per-page inline styles with hard-coded hex values; border radii and type scales differ per page.
- Heavy decorative dependencies (`three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `lenis`) used for star-fields and parallax; Dashboard renders a Three.js canvas behind data.
- Fake data presented as real (telemetry, upload phases, suggested rewrites).
- 1.8 s artificial delay after login "for the cinematic zoom".
- No shared app shell/sidebar; navigation relies on `localStorage.candidateId`.
- No empty/error/loading-state system; many pages render raw text like `LOADING...`.
- Camera stream is requested in the interview room without being used for anything but a preview.
- Interview room gives no indication of question count, round progress or difficulty.
- Mobile layouts largely untested (`gridTemplateColumns: '1fr 1fr'` with one media query).

## 7. Performance bottlenecks

- FAISS `add()`/`delete()` **re-embed every remaining document** in the collection to rebuild the flat index (O(N) API calls per write). Should use `IndexIDMap` + `remove_ids`, or per-candidate chunk sets.
- `_extract_candidate_profile` LLM call runs on every DSA problem fetch and in the legacy tech path even though `resume_structured` is already stored.
- `FAISSService()` re-instantiated in `restore_session`.
- Agents are singletons with unbounded `_session_memory` dicts (never evicted).
- `TechInterviewAgent.respond_to_answer` sends the full `conversation_history` JSON plus all evaluations each turn.
- TTS and STT run as single blocking HTTP calls; no streaming.

## 8. Database and API issues

- `Candidate.email` is globally unique → one resume per email across the whole system; a user cannot have multiple candidate profiles, and users collide (see §3.2). Should be unique per `(user_id, email)` or dropped in favour of `user_id`.
- No table for questions/answers, interview configuration, reports, or resume metadata.
- `RoundTranscript.round_name` is free text while `InterviewSession.current_round` is an enum; DSA rows are stored one-per-problem with JSON in the `transcript` text column.
- `round_scores` JSON on sessions duplicates `RoundTranscript.score`.
- Mixed URL prefixes: `/api/candidates`, `/api/interviews`, `/api/reports`, `/api/dsa` are mounted with `prefix="/api"`, while `/api/dashboard`, `/api/practice`, `/api/debrief` hard-code the prefix in the router.
- `GET /api/reports/{candidate_id}` is keyed by candidate, not session → history cannot show per-session reports.
- `POST /api/candidates/{id}/interview` duplicates `POST /api/interviews/start/{id}` with different semantics (PENDING vs ACTIVE, no orchestrator init).
- Dashboard uses `AsyncSessionLocal()` directly instead of the `get_db` dependency (no shared transaction/rollback handling).
- Alembic chain is not runnable from scratch (§2).

---

## Prioritised implementation checklist

P0 — correctness, data integrity, honesty of results
- [x] Make the app runnable without PostgreSQL (SQLite dev fallback) and without API keys (graceful degradation, no startup crash; clearly flagged fallbacks).
- [x] Remove all fabricated fallback scores; flag heuristic/unavailable evaluations explicitly in data and UI.
- [x] Fix candidate takeover by email; scope candidates per user.
- [x] Fix `_get_resume_text` signature mismatch, `./uploads` literal, enum comparison, naive datetimes, report session selection.
- [x] Fix the pre-existing failing test; pin Vite/plugin versions compatible with Node 20.10.
- [x] Fix Gemini provider to use `google-genai`.

P1 — core academic contributions
- [x] Resume intelligence: structured profile endpoint, section-aware chunking, metadata, per-candidate FAISS retrieval with source references, offline embedding fallback.
- [x] RAG question generation with categories, role/JD awareness, follow-ups, retrieved-context citations.
- [x] Evaluation agent (40/25/20/15 rubric, structured JSON, `next_difficulty`).
- [x] Adaptive difficulty policy with configurable thresholds.
- [x] LangGraph turn graph that is actually executed: route → agent → evaluate → adapt → continue/conclude; orchestrator as the only controller.
- [x] Question-level persistence (`interview_questions` table), interview configuration persistence, report persistence.
- [x] Report agent: full report schema incl. question-wise feedback and learning topics; PDF regenerated from it.

P2 — voice and real-time reliability
- [x] Explicit interview state machine with the required states; per-session turn lock; turn ids for duplicate-event prevention; correct audio format; client-driven `playback_finished` instead of fixed sleeps; text fallback preserved.

P3 — frontend redesign and wiring
- [x] Design system (tokens, components), app shell, all required pages, real data only, responsive.

P4 — tests, experiments, documentation
- [x] Unit tests for policy, evaluation, RAG, graph, new routes; WebSocket flow test updated.
- [x] Experiment scripts (relevance, Precision@K / Recall@K, fixed vs adaptive, AI-vs-human agreement, latency) with honest reporting of what was and was not run live.
- [x] Documentation set and diagrams.

---

## Status after implementation (2026-11-06)

Every item above was implemented and verified (see `TESTING_REPORT.md`): 57 backend tests pass, the frontend
builds and lints clean, and a live end-to-end API/WebSocket smoke run completes an interview and produces a PDF
report in degraded (no-API-key) mode. The sections above describe the repository *as audited* and are kept as the
historical baseline; the current design is documented in `SYSTEM_ARCHITECTURE.md`, `METHODOLOGY.md` and
`API_DOCUMENTATION.md`.

Remaining manual verification: browser walkthrough of the redesigned pages, voice pipeline with real
Deepgram/ElevenLabs keys, LLM path with a Groq/Gemini key, and `alembic upgrade head` on a PostgreSQL database.
