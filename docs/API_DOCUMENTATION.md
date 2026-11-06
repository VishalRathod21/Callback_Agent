# API Documentation — Callback Rehearsal / InterviewAI

Backend: FastAPI application in `backend/main.py` (title `Callback Rehearsal · InterviewAI API`, version `2.0.0`).
Default base URL in development: `http://localhost:8002`.

Everything below is derived from the route modules in `backend/api/routes/`, the WebSocket module
`backend/api/websocket.py`, the pydantic models in `backend/core/schemas.py` and the settings in
`backend/core/config.py`.

## Contents

1. [Conventions](#1-conventions)
2. [Authentication model](#2-authentication-model)
3. [Rate limiting](#3-rate-limiting)
4. [Provenance fields](#4-provenance-fields)
5. [REST endpoints](#5-rest-endpoints)
   - [System / Health](#51-system--health)
   - [Auth](#52-auth--apiauth)
   - [Candidates](#53-candidates--apicandidates)
   - [Interviews](#54-interviews--apiinterviews)
   - [DSA round](#55-dsa-round--apiinterviewssession_iddsa)
   - [Reports](#56-reports--apireports)
   - [Dashboard](#57-dashboard--apidashboard)
   - [Debrief](#58-debrief--apidebrief)
   - [Practice](#59-practice--apipractice)
6. [WebSocket protocol `/ws/interview/{session_id}`](#6-websocket-protocol-wsinterviewsession_id)
7. [Examples](#7-examples)

---

## 1. Conventions

### Router mounting

`main.py` mounts the routers as follows. Note the two different prefix styles:

| Router module | Router prefix | Mounted with | Effective base path |
|---|---|---|---|
| `api/routes/auth.py` | `/auth` | `prefix="/api"` | `/api/auth` |
| `api/routes/candidates.py` | `/candidates` | `prefix="/api"` | `/api/candidates` |
| `api/routes/interviews.py` | `/interviews` | `prefix="/api"` | `/api/interviews` |
| `api/routes/dsa.py` | `/interviews/{session_id}/dsa` | `prefix="/api"` | `/api/interviews/{session_id}/dsa` |
| `api/routes/reports.py` | `/reports` | `prefix="/api"` | `/api/reports` |
| `api/routes/dashboard.py` | `/api/dashboard` | no extra prefix | `/api/dashboard` |
| `api/routes/debrief.py` | `/api/debrief` | no extra prefix | `/api/debrief` |
| `api/routes/practice.py` | `/api/practice` | no extra prefix | `/api/practice` |
| `api/websocket.py` | none | no extra prefix | `/ws/interview/{session_id}` |

All paths in this document are the full, effective paths.

### Request / response format

- Request and response bodies are JSON unless stated otherwise (`POST /api/candidates/upload` is `multipart/form-data`; the PDF report endpoints return `application/pdf`).
- UUID path parameters (`candidate_id`, `session_id`) are validated by FastAPI; a malformed UUID yields `422`. The dashboard and debrief routers parse the UUID by hand and return `400 Invalid candidate ID format` instead.
- Interactive docs (`/docs`, `/redoc`, `/openapi.json`) are served **only** when `ENABLE_DOCS=true`.

### Error shapes

| Status | Body | Source |
|---|---|---|
| 400, 401, 403, 404, 409, 429, 503 | `{"detail": "<message>"}` | `HTTPException` in routes / middleware |
| 422 | FastAPI validation error body (`{"detail": [...]}`) | pydantic validation |
| 500 (database) | `{"detail": "A database error occurred. Please try again later.", "correlation_id": "<uuid>"}` | `sqlalchemy_exception_handler` |
| 500 (other) | `{"detail": "An internal server error occurred. Please contact support.", "correlation_id": "<uuid>"}` | `global_exception_handler` |

`401` responses from the auth dependency carry `WWW-Authenticate: Bearer`. `429` responses carry a `Retry-After` header (seconds).

### Security headers

Every HTTP response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` and a `Content-Security-Policy` header. CORS origins come from `CORS_ALLOWED_ORIGINS` (+ `FRONTEND_URL`), with credentials allowed and `Content-Disposition` exposed (needed for PDF filenames).

---

## 2. Authentication model

Implemented in `api/routes/auth.py` and `core/security.py`.

| Item | Value |
|---|---|
| Password hashing | Argon2 (`argon2-cffi`) |
| Access token | JWT, `HS256`, payload `{sub: user_id, exp, iat, type: "access"}`, lifetime `ACCESS_TOKEN_EXPIRE_MINUTES` (default 15) |
| Refresh token | random 64-hex string; **only its SHA-256 hash** is stored in `refresh_tokens`; delivered in an `HttpOnly` cookie named `refresh_token`, `SameSite=Lax`, `Path=/api/auth`, `Secure` when `COOKIE_SECURE`/production |
| Refresh lifetime | `REFRESH_TOKEN_EXPIRE_DAYS` (30) or `REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS` (90) with `remember_me=true` |
| Rotation | `POST /api/auth/refresh` deletes the presented token and issues a new one (Refresh Token Rotation). Presenting an unknown, revoked or expired token that still resolves to a user **deletes all of that user's refresh tokens** (reuse detection). |

### How to authenticate a request

Send `Authorization: Bearer <access_token>`.

A `?token=<access_token>` **query-string** token is accepted by `get_current_user` *only* on report download paths (`_allows_query_token`): paths under `/api/reports/` that do not contain `/data` — i.e. `GET /api/reports/session/{session_id}/pdf` and `GET /api/reports/{candidate_id}`. Everywhere else a query token is ignored. The frontend uses this for browser-initiated PDF downloads where headers cannot be set.

The WebSocket endpoint authenticates with `?token=` (or an `access_token` cookie); see section 6.

Auth dependency failure modes: `401` (missing/invalid/expired token, unknown user) and `403` (`is_active=false`).

Endpoints marked **Auth: none** below have no `get_current_user` dependency.

---

## 3. Rate limiting

`services/rate_limiter.py` installs `RateLimitingMiddleware` (in-memory, per process; `RATE_LIMIT_ENABLED` default `true`). Skipped for `/health`, `/favicon.ico` and any path starting with `/ws`.

| Scope | Key | Limit | Window | Behaviour |
|---|---|---|---|---|
| Public (no valid Bearer token) | client IP | `RATE_LIMIT_PUBLIC_LIMIT` = 30 | `RATE_LIMIT_PUBLIC_WINDOW` = 60 s | sliding window |
| Authenticated user actions | `sub` of the JWT | `RATE_LIMIT_USER_LIMIT` = 100 | `RATE_LIMIT_USER_WINDOW` = 60 s | sliding window |
| Auth routes `/api/auth/signup`, `/api/auth/login`, `/api/auth/verify-email` | IP **and** account e-mail (read from JSON body) | `RATE_LIMIT_AUTH_IP_LIMIT` = 5 / `RATE_LIMIT_AUTH_ACCOUNT_LIMIT` = 5 | 60 s each | sliding window plus **exponential backoff**: base `RATE_LIMIT_AUTH_BACKOFF_BASE` = 2 s, factor `RATE_LIMIT_AUTH_BACKOFF_FACTOR` = 2, cap `RATE_LIMIT_AUTH_BACKOFF_MAX` = 300 s, violation counter reset after `RATE_LIMIT_AUTH_COOLDOWN` = 3600 s of inactivity. A successful (`<400`) login/signup resets the IP and account counters. |
| `/api/auth/forgot-password`, `/api/auth/reset-password` | IP and account e-mail | 3 (hard-coded) | 3600 s (hard-coded) | sliding window |
| Resume upload (`POST /api/candidates/upload`, checked inside the route) | user id | `RATE_LIMIT_UPLOAD_LIMIT` = 10 | `RATE_LIMIT_UPLOAD_WINDOW` = 3600 s | sliding window |

Client IP is `request.client.host` unless `TRUSTED_PROXY=true`, in which case `X-Forwarded-For` / `X-Real-IP` are honoured.

All limit violations return `429` with `{"detail": "..."}` and `Retry-After`.

---

## 4. Provenance fields

The system never hides a fallback. Every AI-produced artefact records how it was produced:

| Field | Where | Values | Meaning |
|---|---|---|---|
| `generation_source` | question records (`question_meta` on the WebSocket, orchestrator state) | `llm`, `bank`, `restored` | `llm`: generated by the configured LLM with resume/RAG context; `bank`: curated fallback question bank because the LLM was unavailable or failed; `restored`: record rebuilt from the database after a restart. Not persisted as a column (`interview_questions` stores `retrieval_sources` and `generation_latency_ms`). |
| `evaluation_source` | `interview_questions.evaluation_source`, every evaluation JSON, `round_complete.evaluation`, DSA evaluations, report `evaluation_provenance` | `llm`, `heuristic`, `unavailable`, `mixed` (round aggregates only) | `llm`: rubric scored by the LLM with evidence quotes; `heuristic`: local lexical heuristic (answer length/structure/term overlap; `technical_correctness` and `conceptual_understanding` are capped at 6 and *do not* certify correctness); `unavailable`: empty / non-answer, or a DSA submission that could not be scored (`overall_score: null`). |
| `screening_source` | `candidates.screening_result.screening_source`, upload response, `/profile` → `screening.source` | `llm`, `heuristic` | `heuristic`: keyword screening (`_fallback_screening`) — reports only skills literally present in the resume. |
| `extraction_source` | `candidates.resume_structured.extraction_source`, upload response, `/profile` → `profile.extraction_source` | `llm`, `heuristic` | `heuristic`: section-detection parsing without an LLM. |
| `narrative_source` | `interview_reports.narrative_source`, report JSON | `llm`, `fallback` | `fallback`: deterministic narrative built from scores. |

The `/api/system/status` endpoint exposes the live capability flags (LLM availability, embedding backend, voice, database) that the frontend uses to explain degraded modes.

---

## 5. REST endpoints

### 5.1 System / Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | `{"status": "healthy", "service": "Callback Agent API", "docs": "/docs" \| null}` |
| GET | `/health` | none | `{"status": "ok"}` — excluded from rate limiting; used by `start_dev.sh` readiness loop |
| GET | `/api/system/status` | none | Capability flags (below) |

`GET /api/system/status` response:

```json
{
  "environment": "development",
  "llm": {"provider": "groq", "available": false},
  "embeddings": {"backend": "hashing", "dim": 768},
  "voice": {"enabled": false, "stt": false, "tts": false},
  "database": "sqlite",
  "adaptive_policy": {"enabled": true, "decrease_max": 4.0, "increase_min": 8.0},
  "rubric_weights": {"technical_correctness": 0.4, "conceptual_understanding": 0.25,
                     "answer_completeness": 0.2, "communication_clarity": 0.15},
  "version": "2.0.0"
}
```

### 5.2 Auth — `/api/auth`

Password rules (all password fields): 8–128 chars, at least one uppercase, one lowercase, one digit. `full_name`: 2–100 chars, letters/spaces/hyphens/apostrophes only, no leading/trailing spaces.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/signup` | none | `UserSignup` `{email, full_name, password, password_confirm}` | `TokenResponse` `{access_token, token_type: "bearer", user: UserResponse}` + sets `refresh_token` cookie | `409` e-mail already registered; `422` validation (passwords differ, weak password, bad name) |
| POST | `/api/auth/login` | none | `UserLogin` `{email, password, remember_me?: false}` | `TokenResponse` + cookie; updates `last_login` | `401` invalid credentials; `403` inactive account |
| POST | `/api/auth/logout` | cookie (optional) | — | `{"status": "success", "message": "Logged out successfully."}`; deletes the presented refresh token and clears the cookie | — |
| POST | `/api/auth/logout-all` | Bearer | — | `{"status": "success", ...}`; deletes **all** refresh tokens of the user | `401` |
| POST | `/api/auth/refresh` | `refresh_token` cookie | — | `{access_token, token_type, user}` + new cookie (rotation; the new token keeps the old expiry) | `401` missing/invalid/expired (and token wipe on reuse); `403` inactive |
| GET | `/api/auth/me` | Bearer | — | `UserResponse` | `401`, `403` |
| PATCH | `/api/auth/me` | Bearer | `UserUpdate` `{full_name?, email?, profile_image?}` (`profile_image` must start with `http://`, `https://` or `/uploads/`) | `UserResponse`; changing e-mail sets `is_verified=false` | `409` e-mail taken; `422` |
| GET | `/api/auth/me/preferences` | Bearer | — | `{"preferences": {...}}` (`{}` when unset) | — |
| PATCH | `/api/auth/me/preferences` | Bearer | `UserPreferences` `{default_mode?: voice\|text, default_difficulty?: easy\|medium\|hard, default_rounds?: subset of dsa/technical/hr, questions_per_round?: 2–12, adaptive?: bool, target_role?: 2–100 chars, theme?: dark\|light\|system}` | `{"preferences": <merged>}` — merged into the stored object (`exclude_none`) | `422` |
| DELETE | `/api/auth/me` | Bearer | — | `{"status": "success", "message": "...permanently deleted."}`; deletes the user (cascades to candidates, sessions, transcripts, questions, reports, refresh tokens), the per-candidate upload folders and FAISS vectors; clears the cookie | — |
| POST | `/api/auth/change-password` | Bearer | `ChangePassword` `{old_password, new_password, new_password_confirm}` | `{"status": "success", ...}` | `400` incorrect old password; `422` |
| POST | `/api/auth/forgot-password` | none | `ForgotPassword` `{email}` | Always `{"status": "success", "message": "If the email is registered, a password reset link has been generated and logged."}` — the token is stored on the user (15 min expiry) and **only logged**; there is no mailer | — |
| POST | `/api/auth/reset-password` | none | `ResetPassword` `{token (alnum/_/-, ≤128), new_password, new_password_confirm}` | `{"status": "success", "message": "Password reset successfully."}` | `400` invalid/expired token |
| POST | `/api/auth/verify-email?token=<token>` | none | query param `token` | `{"status": "success", "message": "Email verified successfully."}` | `400` invalid format / unknown / expired (24 h) |

`UserResponse`: `{id, full_name, email, profile_image, is_verified, is_active, created_at, last_login, preferences}`.

### 5.3 Candidates — `/api/candidates`

A *candidate* is one uploaded resume profile owned by a user; a user may have several, unique per `(user_id, email)`.

#### `POST /api/candidates/upload` — Auth: Bearer — `multipart/form-data`

| Form field | Rules |
|---|---|
| `name` | 2–100 chars; letters (Latin incl. accents, Devanagari), dots, apostrophes, hyphens, spaces |
| `email` | ≤150 chars, syntactically valid (no deliverability check); lower-cased |
| `target_role` | 2–100 chars; `A-Za-z0-9.+# -/()` |
| `resume` | `.pdf` or `.docx`, ≤ 5 MB; magic bytes verified (`%PDF-` / ZIP containing `word/document.xml`) |

Pipeline: validate → save to `UPLOAD_DIR/<candidate_id>/resume.<ext>` → parse (PyMuPDF / python-docx) → in parallel: ATS screening + structured extraction (LLM, with heuristic fallbacks) → upsert candidate (re-upload for the same e-mail **clears that profile's previous sessions**) → chunk + index in FAISS via `RAGService.index_resume`.

Response (200):

```json
{
  "candidate_id": "uuid",
  "decision": "pass | fail",
  "ats_score": 72.5,
  "matched_skills": ["Python", "SQL"],
  "missing_skills": ["Docker"],
  "experience_level": "junior | ... | unknown",
  "reasoning": "...",
  "screening_source": "llm | heuristic",
  "extraction_source": "llm | heuristic",
  "resume_info": {"word_count": 512, "pages": 2, "chunks_indexed": 9, "filename": "resume.pdf"},
  "profile": {"summary": "", "skills": [], "programming_languages": [], "projects": [],
              "experience": [], "education": [], "certifications": [], "extraction_source": "..."},
  "next_steps": {"message": "...", "suggested_rounds": ["dsa", "technical", "hr"]},
  "rejection": {"message": "...", "missing_skills": []}
}
```

`next_steps` is present when `decision == "pass"` (candidate status → `screened`), otherwise `rejection` (status → `rejected`).

Errors: `400` (validation, type, size, signature), `422` (parse failure / no extractable text), `429` upload limit.

#### Other candidate endpoints

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/candidates/me` | Bearer | — | `{"candidates": [ProfileView...], "latest": ProfileView \| null}` newest first | — |
| GET | `/api/candidates/{candidate_id}` | Bearer | — | `ProfileView` + `sessions: [{id, current_round, round_scores, overall_score, status, mode, started_at, ended_at}]` | `404`, `403` not owner |
| GET | `/api/candidates/{candidate_id}/profile` | Bearer | — | `ProfileView` with `resume.sections: {section: chunk_count}` and `resume.embedding_backend` | `404`, `403` |
| GET | `/api/candidates/{candidate_id}/chunks` | Bearer | — | `{"chunks": [{chunk_id, section, chunk_index, text}], "backend": "hashing \| gemini"}` | `404` (also returned when not owner) |
| POST | `/api/candidates/{candidate_id}/retrieve` | Bearer | `{query: 2–500 chars, k?: 1–10 (default 4)}` | `{query, backend, latency_ms, results: [{chunk_id, section, chunk_index, score, preview, text}]}` | `404`, `503` RAG service unavailable |
| PATCH | `/api/candidates/{candidate_id}` | Bearer | `{target_role?: 2–100 chars}` | `ProfileView` | `404`, `422` |
| DELETE | `/api/candidates/{candidate_id}` | Bearer | — | `{"deleted": true, "candidate_id": "..."}`; removes vectors, upload folder, and cascades sessions | `404` |
| POST | `/api/candidates/{candidate_id}/interview` | Bearer | — | **Deprecated alias** of `POST /api/interviews/start/{candidate_id}` with default configuration | as that endpoint |

`ProfileView`:

```json
{
  "id": "uuid", "name": "...", "email": "...", "target_role": "...",
  "status": "uploaded | screened | interviewing | completed | rejected",
  "ats_score": 72.5, "created_at": "ISO-8601",
  "resume": {"filename": "...", "pages": 2, "word_count": 512, "chunk_count": 9, "parsed_at": "...", "available": true},
  "profile": {"summary": "...", "skills": [], "programming_languages": [], "projects": [], "experience": [],
              "education": [], "certifications": [], "extraction_source": "llm | heuristic"},
  "screening": {"decision": "pass | fail", "matched_skills": [], "missing_skills": [], "experience_level": "...",
                "reasoning": "...", "suggested_rounds": ["dsa", "technical", "hr"], "source": "llm | heuristic"}
}
```

### 5.4 Interviews — `/api/interviews`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/interviews/config/options` | **none** | Options for the setup page |
| GET | `/api/interviews/engine/graph` | **none** | LangGraph topology + policy |
| POST | `/api/interviews/start/{candidate_id}` | Bearer | Create and initialise a session |
| GET | `/api/interviews` (also `/api/interviews/`) | Bearer | Session history for the user |
| GET | `/api/interviews/{session_id}` | Bearer | Session detail |
| GET | `/api/interviews/{session_id}/questions` | Bearer | Persisted question/answer records |
| POST | `/api/interviews/{session_id}/cancel` | Bearer | Cancel a session |

#### `GET /api/interviews/config/options`

```json
{
  "target_roles": ["Software Engineer", "Backend Developer", "...15 roles"],
  "rounds": [{"id": "dsa", "label": "DSA Coding", "description": "..."},
             {"id": "technical", "label": "Technical", "description": "..."},
             {"id": "hr", "label": "HR / Behavioural", "description": "..."}],
  "difficulties": ["easy", "medium", "hard"],
  "modes": ["voice", "text"],
  "voice_available": false,
  "defaults": {"questions_per_round": 5, "dsa_problems": 2, "difficulty": "medium", "duration_minutes": 30, "adaptive": true},
  "limits": {"questions_per_round": [2, 12], "dsa_problems": [1, 4], "duration_minutes": [10, 120]},
  "policy": {"enabled": true, "decrease_max": 4.0, "increase_min": 8.0, "levels": ["easy", "medium", "hard"]},
  "rubric_weights": {"technical_correctness": 0.4, "conceptual_understanding": 0.25, "answer_completeness": 0.2, "communication_clarity": 0.15},
  "llm_available": false
}
```

#### `GET /api/interviews/engine/graph`

`{"graph": {"nodes": [...], "edges": [[from, to], ...]}, "policy": {...}, "rubric_weights": {...}, "embedding_backend": "hashing" | "gemini" | null}`.
Nodes: `entry, select_agent, technical_agent, hr_agent, dsa_agent, evaluate_answer, adapt_difficulty, conclude_round, finalize_round`.

#### `POST /api/interviews/start/{candidate_id}`

Body (`InterviewConfigIn`, all optional; may be omitted entirely):

| Field | Type / constraint | Default |
|---|---|---|
| `rounds` | list, subset of `dsa`, `technical`, `hr` (re-ordered canonically dsa → technical → hr) | all three |
| `difficulty` | `easy` \| `medium` \| `hard` | `medium` |
| `mode` | `voice` \| `text` | `text` |
| `questions_per_round` | 2–12 (clamped to `MAX_QUESTIONS_PER_ROUND`) | `DEFAULT_QUESTIONS_PER_ROUND` (5) |
| `dsa_problems` | 1–4 | `DEFAULT_DSA_PROBLEMS` (2) |
| `duration_minutes` | 10–120 | 30 |
| `adaptive` | bool | `true` |
| `use_rag` | bool | `true` |
| `job_description` | ≤ 4000 chars | `""` |
| `target_role` | 2–100 chars | candidate's `target_role` |

Preconditions: candidate owned by the caller; status not `rejected` (`400 This resume did not pass screening...`) and not `uploaded` (`400 Resume has not been screened yet.`). If `mode=voice` but no STT service is loaded, `config.voice_available` is set `false` and the session proceeds in text.

Response:

```json
{
  "session_id": "uuid", "candidate_id": "uuid", "status": "active", "current_round": "dsa",
  "rounds_queue": ["dsa", "technical", "hr"],
  "config": {"rounds": [...], "questions_per_round": 5, "dsa_problems": 2, "difficulty": "medium", "mode": "text",
             "duration_minutes": 30, "adaptive": true, "use_rag": true, "job_description": "", "target_role": "...",
             "voice_available": false},
  "persona": {"name": "Senior Staff Engineer", "description": "..."}
}
```

The persona is chosen at random from five presets (`agents/orchestrator.py: PERSONAS`). Candidate status becomes `interviewing`.

#### `GET /api/interviews?status=&limit=`

Query: `status` (one of `pending|active|completed|cancelled`; anything else is ignored), `limit` (default 50, clamped 1–200).
Response: `{"sessions": [SessionSummary...], "total": n}` newest first.

`SessionSummary`: `{session_id, candidate_id, candidate_name, target_role, status, current_round, rounds, mode, difficulty, adaptive, round_scores, overall_score, total_questions, duration_seconds, started_at, ended_at, has_report}`.

#### `GET /api/interviews/{session_id}`

`SessionSummary` plus `candidate_name`, `resume_available`, `config`, `persona`, `progress` (orchestrator progress or `null`), `questions: [QuestionView...]`, `rounds: [{name, score, evaluation, created_at}]` (round-level transcripts only — DSA per-problem JSON rows are excluded), `voice_enabled`.
Errors: `404`, `403`.

`QuestionView`:

```json
{
  "id": "uuid", "round": "technical", "index": 0, "category": "python", "difficulty": "medium",
  "next_difficulty": "hard", "is_follow_up": false, "question": "...", "answer": "...",
  "scores": {"technical_correctness": 8, "conceptual_understanding": 7, "answer_completeness": 7,
             "communication_clarity": 8, "overall": 7.6},
  "feedback": "...", "strengths": [], "gaps": [], "ideal_answer_points": [], "learning_topics": [],
  "policy": {"previous_difficulty": "medium", "next_difficulty": "hard", "direction": "increase", "score": 7.6, "reason": "..."},
  "evaluation_source": "llm | heuristic | unavailable",
  "retrieval_sources": [{"chunk_id": "...", "section": "projects", "chunk_index": 2, "score": 0.41, "preview": "..."}],
  "generation_latency_ms": 1200, "evaluation_latency_ms": 900,
  "asked_at": "ISO-8601", "answered_at": "ISO-8601 | null"
}
```

#### `GET /api/interviews/{session_id}/questions`

`{"session_id": "...", "questions": [QuestionView...]}`. Errors `404`, `403`.

#### `POST /api/interviews/{session_id}/cancel`

Sets status `cancelled`, `ended_at`, and cancels the orchestrator state. Response `{"session_id": "...", "status": "cancelled"}`. Errors: `404`, `403`, `400` when already completed.

### 5.5 DSA round — `/api/interviews/{session_id}/dsa`

The DSA round runs over REST (the frontend's Monaco code-editor workspace), not over the WebSocket. Supported `language` values: `python, javascript, java, cpp, c, go, rust, typescript`. Evaluation is **LLM static reasoning over the code** — the code is not executed.

All three endpoints require Bearer auth, return `404` for an unknown session, `403` when the session's candidate is not owned by the caller.

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/problem` | — | `ProblemView` (generated on first call, cached in orchestrator state) | `400` DSA round not active |
| POST | `/hint` | `{current_code: 1–50000 chars, language}` | `{"hint": "...", "hints_used": n}` | `400` no active problem; `422` language |
| POST | `/submit` | `{code: 1–50000, language, verbal_explanation?: ≤5000, problem_index: 0–10}` | see below | `400` no active problem; `409` `problem_index` ≠ current (already submitted) |

`ProblemView` = the generated problem (`title, description, examples, constraints, starter_code{python, javascript}, pattern, difficulty, ...`) plus `problem_index`, `problems_total`, `difficulty_policy` (`{previous_difficulty, next_difficulty, direction, reason}`), `adaptive`.

`POST /submit` response when more problems remain:

```json
{"evaluation": DsaEvaluation, "next_problem": ProblemView, "round_complete": false,
 "difficulty_decision": {"previous_difficulty": "medium", "next_difficulty": "hard", "direction": "increase", "reason": "..."}}
```

When the configured number of problems is reached:

```json
{"evaluation": DsaEvaluation, "next_problem": null, "round_complete": true,
 "round_result": {"score": 72.5, "problems_solved": 1, "problems_attempted": 2, "avg_correctness": 7.0,
                  "avg_complexity_awareness": 6.5, "evaluation_source": "llm | mixed | unavailable",
                  "difficulty_trace": ["medium", "hard"], "feedback": "...", "strengths": [], "weaknesses": [], "learning_topics": []},
 "next_round": "technical | hr | complete", "interview_status": "active | complete"}
```

`DsaEvaluation`: `{correct, time_complexity, space_complexity, edge_cases_handled, edge_cases_missed, code_quality_notes, approach_score, correctness_score, complexity_score, communication_score, overall_score (0–100 or null), feedback, evaluation_source, hints_used, problem_title, difficulty, pattern, language, problem_index}`. With no LLM every score is `null` and `evaluation_source` is `"unavailable"`.

Each submission is persisted as a `round_transcripts` row (JSON transcript); the round summary is a second row. Completing the last round marks the session `completed`.

### 5.6 Reports — `/api/reports`

All endpoints require auth (Bearer, or `?token=` on the two PDF routes). Ownership: `403 Not authorized to view this report.`; unknown session/candidate: `404`.

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/reports/session/{session_id}/data` | `regenerate?: bool` | `ReportData` + `report_id`, `pdf_available` |
| GET | `/api/reports/session/{session_id}/pdf` | `regenerate?: bool`, `token?` | `application/pdf`, `Content-Disposition: attachment; filename="<name>_interview_report_<sid8>.pdf"`; `500` if rendering fails |
| GET | `/api/reports/{candidate_id}/data` | `regenerate?` | Same as above for the candidate's latest session (completed sessions preferred, then most recent) |
| GET | `/api/reports/{candidate_id}` | `regenerate?`, `token?` | PDF for that session |

Reports are cached in `interview_reports` (one per session) and rebuilt automatically when the question count or session status changed since generation, or when `regenerate=true` (which also deletes the cached PDF).

`ReportData` top-level keys: `report_version` (2), `generated_at`, `narrative_source`, `candidate`, `session`, `rounds`, `rubric_averages`, `skill_performance`, `difficulty_trace`, `questions`, `evaluation_provenance`, `narrative`, `learning_topics` (see `DATABASE_SCHEMA.md` for the full structure).

### 5.7 Dashboard — `/api/dashboard`

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/dashboard/overview` | Bearer | User-level analytics (below) |
| GET | `/api/dashboard/{candidate_id}` | Bearer | Per-candidate analytics; `400` bad UUID, `404`, `403` |

`GET /api/dashboard/overview`:

```json
{
  "has_data": true,
  "user": {"name": "...", "email": "..."},
  "candidate": {"id", "name", "target_role", "status", "ats_score", "resume_uploaded", "skills": [..≤12], "resume_parsed_at"} ,
  "candidates_count": 1,
  "totals": {"interviews", "completed", "active", "average_score", "best_score", "total_time_min", "questions_answered"},
  "averages": {"overall", "dsa", "technical", "hr"},
  "trends": {"overall", "dsa", "technical", "hr"},
  "readiness_score": 0-100,
  "readiness_breakdown": {"latest_score_factor", "trend_factor", "consistency_factor", "sessions_factor"},
  "score_timeline": [{"session_number", "session_id", "date", "overall", "dsa", "technical", "hr", "duration_min", "mode", "target_role"}],
  "skill_performance": [{"category", "average", "questions"}],
  "rubric_averages": {"technical_correctness", "conceptual_understanding", "answer_completeness", "communication_clarity"},
  "evaluation_provenance": {"llm": n, "heuristic": n, "unavailable": n},
  "recent_sessions": [{"session_id", "candidate_name", "target_role", "status", "overall_score", "round_scores", "mode",
                       "current_round", "started_at", "duration_min", "rounds"}]
}
```

Readiness score = latest score 40 % · improvement 30 % · consistency 20 % · session volume 10 % (computed only from **completed** sessions).

`GET /api/dashboard/{candidate_id}` returns `{"has_data": false, "message": "No completed sessions yet", "candidate_name", "target_role"}` when nothing is completed; otherwise `{has_data, candidate_name, target_role, total_sessions, total_time_min, readiness_score, readiness_breakdown, score_timeline, trends, averages, weak_areas: [{name, avg_score, trend}], skill_performance, rubric_averages, evaluation_provenance, best_session, worst_session, latest_session}`.

### 5.8 Debrief — `/api/debrief`

Post-interview coaching chat about the candidate's **latest completed** session. Conversation history is held **in process memory** (`_conversations`, last 20 messages per candidate) and is lost on restart. (The source comment mentions a 2-hour expiry, but no expiry code exists.)

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/debrief/{candidate_id}/context` | Bearer | — | `{candidate_name, target_role, overall_score, round_scores, starter_questions: [str], has_existing_conversation}` | `400` bad UUID, `404` candidate / no completed interview, `403` |
| POST | `/api/debrief/chat` | Bearer | `{candidate_id, message}` | `{"response": "...", "conversation_id": "<candidate_id>"}` | same |
| DELETE | `/api/debrief/{candidate_id}/conversation` | Bearer | — | `{"cleared": true}` | `400`, `404`, `403` |

### 5.9 Practice — `/api/practice`

Quick-practice sessions live **in process memory** (`_practice_sessions`) until saved.

| Method | Path | Auth | Request | Response | Errors |
|---|---|---|---|---|---|
| POST | `/api/practice/start` | Bearer | `{topic: "dsa_theory" \| "system_design" \| "behavioral" \| "random", target_role?: "Software Engineer", candidate_id?: uuid (resume-aware), question_count?: 6}` | `{session_id (8 chars), topic, total_questions, first_question: {id, question, topic, answered, score, ...}}` | `403` candidate not owned |
| POST | `/api/practice/answer` | Bearer | `{session_id, question_id: int, answer}` | `{evaluation: {score 0–10, ...}, next_question \| null, session_complete, summary \| {average_score, total_questions, strong, decent, needs_work}}` | `404` session/question, `403` not owner, `400` answer shorter than 5 chars |
| POST | `/api/practice/save` | Bearer | `{candidate_id, session_id, topic, average_score}` | `{"saved": true, "session_id": "<new interview_sessions uuid>"}` — creates a `completed` `interview_sessions` row with `round_scores` mapped from `average_score × 10` (topic → round; `random` fills all three) | `400`, `404`, `403` |
| GET | `/api/practice/{session_id}` | Bearer | — | raw in-memory session object | `404`, `403` |

---

## 6. WebSocket protocol `/ws/interview/{session_id}`

Implemented in `backend/api/websocket.py`. Used for the **technical** and **HR** rounds (the DSA round is REST). All frames are JSON text; every message has a `type` field. Inbound messages are validated with pydantic schemas; unknown types or invalid fields produce an `error` frame and the connection stays open.

URL: `ws://localhost:8002/ws/interview/{session_id}?token=<access_token>`

### 6.1 Connection and authentication

1. `session_id` must be a UUID → otherwise `error {code: 4000}` then close `4000`.
2. Token from `?token=` query parameter or an `access_token` cookie. Missing/invalid → `error {code: 4003}` then close `4003`.
3. Session must exist → otherwise `error {code: 4004}` then close `4004`.
4. The session's candidate must belong to the token's user → otherwise `error {code: 4003}` then close `4003`.
5. On success the server accepts and sends `connected`, then (on reconnect) `session_history`.

Authentication/ownership checks are skipped when running under pytest / `TESTING=true`.

| Close code | Meaning | Client behaviour (`useWebSocket.js`) |
|---|---|---|
| 4000 | invalid `session_id` format | permanent — do not reconnect |
| 4003 | missing/invalid token, or not the owner | permanent |
| 4004 | session not found | permanent |

The server also sends a `ping` frame every 25 s as keepalive, and waits up to 120 s for a frame before looping (it does not disconnect on that timeout).

### 6.2 Client → server messages

| `type` | Fields | Notes |
|---|---|---|
| `ping` | — | server replies `pong` |
| `pong` | — | reply to server keepalive; ignored |
| `start_round` | `round?: "technical" \| "hr" \| "dsa"`, `target_role?`, `resume_context?` | Opens the orchestrator's **current** round (a different `round` value is logged and ignored). Also used to re-sync after reconnect: if the round was already opened the pending question is replayed. If the current round is `dsa` the server answers `error {code: "dsa_round"}` and `state_change {state: "waiting", redirect: "dsa"}`. Ignored while another turn is being processed. |
| `audio_chunk` | `data: base64 (≤ 1,000,000 chars)`, `duration_ms: 0–10000 (default 250)` | Accepted only in state `listening` **and** when voice is enabled (STT loaded). Decoded chunks ≥ 50 bytes are buffered; server replies `audio_received {buf_ms}`. Chunks above ~140 KB base64 are dropped. |
| `silence_detected` | — | Flush buffer (must be > 500 bytes) → Deepgram STT → `transcript` → evaluation. Ignored unless voice enabled and state `listening`. |
| `candidate_text` / `typed_answer` | `text: 1–5000 chars` | Text answer (text mode or voice fallback). Only in state `listening`; if a turn is already in progress the server replies `error "Still processing your previous answer."`. |
| `playback_finished` | `turn_id?: ≤ 64 chars` | Tells the server the client finished playing the `ai_audio` for `turn_id` (or any current turn when omitted); the server then switches to `listening`. |
| `end_round` | — | Finalise the current round now (aggregate, persist, advance). |
| `cancel_interview` | — | Cancel the session (status `cancelled`). |

### 6.3 Server → client messages

| `type` | Fields | When |
|---|---|---|
| `connected` | `session_id, voice_enabled, state, progress` | right after accept |
| `session_history` | `round, current_question, history: [{speaker, text}], progress` | on reconnect of a live session |
| `state_change` | `state, message?, turn_id?, redirect?` | every state transition |
| `ai_response` | `text, speaker: "interviewer", turn_id, question_meta, progress` | interviewer text, sent **before** audio |
| `ai_audio` | `data: base64, format: "mp3", turn_id, duration_estimate_ms` | TTS audio for the turn (only when a TTS service is loaded and synthesis succeeded) |
| `audio_received` | `buf_ms` | ack of an `audio_chunk` |
| `transcript` | `text, speaker: "candidate", turn_id, stt_latency_ms?` | the candidate's answer (STT result or echoed text) |
| `answer_evaluated` | `turn_id, evaluation, difficulty, progress` | after the evaluation agent scored the answer |
| `round_should_end` | — | question limit reached; a closing message follows as a final `ai_response` |
| `round_complete` | `round, score, feedback, evaluation, next_round` | round finalised and persisted |
| `interview_complete` | `session_id, score` | no rounds left (or `start_round` on a finished session) |
| `interview_cancelled` | `session_id` | after `cancel_interview` |
| `pong` | — | reply to client `ping` |
| `ping` | — | keepalive every 25 s |
| `error` | `message, code?` | validation errors, auth failures (numeric code), `dsa_round`, processing failures |

Field details:

- `question_meta`: `{index, category, difficulty, is_follow_up, generation_source, retrieval_sources: [{chunk_id, section, chunk_index, score, preview}]}` — `null` for closing messages.
- `progress`: `{round, rounds, round_index, questions_per_round, questions_asked, questions_answered, difficulty, adaptive, status}`.
- `evaluation` in `answer_evaluated` is the compact form: `{technical_correctness, conceptual_understanding, answer_completeness, communication_clarity, overall_score, feedback, next_difficulty, evaluation_source, difficulty, policy}` where `policy` is the policy-decision reason string.
- `evaluation` in `round_complete` is the round aggregate without `questions`/`transcript`: `{score (0–100), questions_answered, rubric_averages, evaluation_source, feedback, strengths, weaknesses, learning_topics, difficulty_trace, per_question, completed_at}`.

### 6.4 Interview state machine

States (constants in `websocket.py`): `initializing`, `listening`, `processing`, `generating`, `speaking`, `waiting`, `completed`, `error`.

```
connect ──────────────────────────► initializing
start_round ──────────────────────► generating ─► speaking ─(playback_finished | timeout)─► listening
candidate answer (text / STT) ────► processing ─► answer_evaluated
      ├─ more questions ──────────► generating ─► speaking ─► listening
      └─ limit reached ───────────► round_should_end ─► speaking (closing, final) ─► processing (finalise)
                                        ├─ next round exists ─► round_complete ─► waiting
                                        └─ no more rounds ────► round_complete ─► interview_complete ─► completed
end_round ────────────────────────► processing ─► round_complete ─► waiting | completed
cancel_interview ─────────────────► completed (+ interview_cancelled)
start_round without orchestrator state ─► error
```

- `speaking → listening` happens when the client sends `playback_finished` for the current `turn_id`, or after a bounded safety timeout of `min(45 s, 2 s + 0.45 s × words) + 5 s`. In text-only deployments (no TTS loaded) the transition is immediate after `ai_response`.
- In state `waiting` the client should send `start_round` to open the next round (or navigate to the DSA workspace when `redirect: "dsa"` was sent).
- A per-session `asyncio.Lock` serialises turns; events arriving while locked are ignored or answered with an `error`.

### 6.5 Turn ids

Every interviewer turn gets `turn_id = "<first 8 chars of session_id>-<sequence>"`. `state_change`, `ai_response`, `ai_audio`, `transcript` and `answer_evaluated` carry it so clients can drop duplicates after reconnects and acknowledge the right audio with `playback_finished`. A `playback_finished` for a stale `turn_id` is ignored.

### 6.6 Persistence side effects

- Each question and each evaluated answer is written to `interview_questions` by the orchestrator during the turn.
- `end_round` / automatic conclusion writes a `round_transcripts` row, updates `interview_sessions.round_scores`, `total_questions`, `current_round`, and on completion `status`, `overall_score`, `ended_at`, `duration_seconds` and the candidate's status.

---

## 7. Examples

### 7.1 Sign up, then read system status

```bash
curl -s -c cookies.txt -X POST http://localhost:8002/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","full_name":"Jane Doe","password":"Passw0rdX","password_confirm":"Passw0rdX"}'
# → {"access_token":"<jwt>","token_type":"bearer","user":{...}}   (refresh_token cookie saved to cookies.txt)

curl -s http://localhost:8002/api/system/status
```

### 7.2 Upload a resume and start a configured interview

```bash
TOKEN="<jwt from login>"

curl -s -X POST http://localhost:8002/api/candidates/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Jane Doe" -F "email=jane@example.com" -F "target_role=ML Engineer" \
  -F "resume=@./resume.pdf"
# → {"candidate_id":"<cid>","decision":"pass","ats_score":...,"screening_source":"llm|heuristic",...}

curl -s -X POST http://localhost:8002/api/interviews/start/<cid> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rounds":["technical","hr"],"difficulty":"medium","mode":"text","questions_per_round":4,"adaptive":true}'
# → {"session_id":"<sid>","current_round":"technical","rounds_queue":["technical","hr"],...}

# later: structured report JSON and the PDF (query token allowed only here)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8002/api/reports/session/<sid>/data
curl -s -o report.pdf "http://localhost:8002/api/reports/session/<sid>/pdf?token=$TOKEN"
```

### 7.3 Text-mode interview turn over the WebSocket

Using `wscat` (`npm i -g wscat`):

```bash
wscat -c "ws://localhost:8002/ws/interview/<sid>?token=$TOKEN"
< {"type":"connected","session_id":"<sid>","voice_enabled":false,"state":"initializing","progress":{...}}
> {"type":"start_round"}
< {"type":"state_change","state":"generating","message":"Preparing the technical round…"}
< {"type":"state_change","state":"speaking","turn_id":"1a2b3c4d-1"}
< {"type":"ai_response","text":"Welcome to the technical round ...","speaker":"interviewer","turn_id":"1a2b3c4d-1",
   "question_meta":{"index":0,"category":"resume_projects","difficulty":"medium","is_follow_up":false,
                    "generation_source":"llm","retrieval_sources":[{"section":"projects","chunk_index":1,"score":0.52,...}]},
   "progress":{...}}
< {"type":"state_change","state":"listening","message":"Your turn — speak or type your answer","turn_id":"1a2b3c4d-1"}
> {"type":"candidate_text","text":"In that project I used FAISS with 600-character chunks because ..."}
< {"type":"transcript","text":"In that project ...","speaker":"candidate","turn_id":"1a2b3c4d-1"}
< {"type":"state_change","state":"processing","message":"Evaluating your answer…"}
< {"type":"answer_evaluated","turn_id":"1a2b3c4d-1","evaluation":{"overall_score":7.6,"next_difficulty":"medium",
   "evaluation_source":"llm","policy":"score 7.6 within [4, 8]: hold level",...},"difficulty":"medium","progress":{...}}
< {"type":"state_change","state":"generating","message":"Preparing the next question…"}
...
> {"type":"end_round"}
< {"type":"round_complete","round":"technical","score":71.3,"next_round":"hr","evaluation":{...}}
< {"type":"state_change","state":"waiting","message":"Next round: hr"}
```

Equivalent minimal Python client:

```python
import asyncio, json, websockets

async def main(sid, token):
    async with websockets.connect(f"ws://localhost:8002/ws/interview/{sid}?token={token}") as ws:
        await ws.send(json.dumps({"type": "start_round"}))
        while True:
            msg = json.loads(await ws.recv())
            print(msg["type"], msg.get("state") or msg.get("text", "")[:80])
            if msg["type"] == "ai_audio":
                await ws.send(json.dumps({"type": "playback_finished", "turn_id": msg["turn_id"]}))
            if msg["type"] == "state_change" and msg["state"] == "listening":
                await ws.send(json.dumps({"type": "candidate_text", "text": "My answer ..."}))
            if msg["type"] in ("round_complete", "interview_complete"):
                break

asyncio.run(main("<sid>", "<jwt>"))
```
