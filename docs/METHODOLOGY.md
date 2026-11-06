# Methodology

## 1. Development methodology

The project followed an **audit-first, incremental** process on an existing codebase:

1. **Audit** — every module was read and the baseline measured (tests, build, runtime dependencies). Findings and a
   prioritised checklist were recorded in `PROJECT_AUDIT.md`.
2. **Stabilise** — correctness and data-integrity defects were fixed first (fabricated fallback scores, candidate
   takeover by e-mail, signature mismatches, timezone arithmetic, build toolchain), and the application was made
   runnable without external services (SQLite, local embeddings, flagged degraded mode).
3. **Implement the contributions** — resume intelligence and RAG, the LangGraph adaptive engine with rubric
   evaluation, persistence and reporting.
4. **Redesign the frontend** against the real API surface, with no mock data.
5. **Verify** — unit and integration tests, a live end-to-end API/WebSocket smoke run, production build.
6. **Experiment and document.**

The application remained runnable after each phase; the backend test suite was executed after every change set.

## 2. Resume intelligence

* **Parsing.** PyMuPDF for PDF, python-docx for DOCX; page and word counts are stored as resume metadata.
* **Structured extraction.** The LLM returns `{name, skills, projects[], experience[], education[], summary}`. When
  the LLM is unavailable a deterministic section parser (`_fallback_structure`) produces a minimal profile and marks
  `extraction_source="heuristic"`. The system never invents skills: both paths only emit text present in the resume.
* **Screening.** LLM ATS screening (`matched_skills`, `missing_skills`, `decision`) with a heuristic keyword fallback
  that is informational (it does not reject unless the resume shows no relevant content) and labelled as such.

## 3. Retrieval-augmented question generation

* **Chunking.** Headings are detected with regular expressions for the standard resume sections; each section is
  split into overlapping windows (600 characters, 120 overlap) on bullet/sentence boundaries so a bullet is never
  cut mid-sentence. Each chunk is tagged `[SECTION]` and carries `candidate_id, section, chunk_index, offsets`.
* **Embedding and indexing.** Gemini `text-embedding-004` (768-d) when configured, otherwise a deterministic
  feature-hashing embedding of word uni/bi-grams and character trigrams (lexical). Vectors are L2-normalised and
  stored in a FAISS `IndexIDMap2(IndexFlatIP)` per collection; metadata is kept in a JSON side-car with the backend
  name so an index is never queried with a different embedding model.
* **Retrieval.** The query is built from the planned category label, its keywords, the role and the last answer;
  results are filtered by `candidate_id` (and optionally section) *before* the top-k cut, and hits below
  `RAG_MIN_SCORE` are dropped. Retrieved chunks are formatted with citation tags and returned as `retrieval_sources`.
* **Category planning.** `plan_categories()` orders the twelve supported categories by role priority and by evidence
  in the resume (skills/projects keywords), always starting with the candidate's own projects when present.
* **Generation.** The prompt contains role, optional job description, difficulty guidance, the category, the
  retrieved context, a compact profile and all previously asked questions; the model must return JSON with the
  question, `is_follow_up`, a rationale and the source tags it used. Duplicates (SequenceMatcher ≥ 0.8) trigger a
  regeneration; on LLM failure a curated bank supplies a question (`generation_source="bank"`).

## 4. Multi-agent orchestration (LangGraph)

The `InterviewGraph` builds a `StateGraph(InterviewState)` with routing nodes (`entry`, `select_agent`), three round
agents, `evaluate_answer`, `adapt_difficulty`, `conclude_round` and `finalize_round` connected by conditional edges
(see `SYSTEM_ARCHITECTURE.md`). The orchestrator is the single controller: it owns the in-memory session store,
per-session locks, DB persistence and restoration. The DSA coding round runs through REST endpoints (editor
workflow) but shares the same difficulty policy and the same `finalize_round` transition.

## 5. Evaluation rubric and adaptive policy

* **Rubric.** Each answer is scored 0–10 on technical correctness (0.40), conceptual understanding (0.25), answer
  completeness (0.20) and communication clarity (0.15); the weighted sum is the overall score. The evaluator must
  quote evidence from the answer, list gaps, ideal answer points and learning topics. Non-answers ("I don't know")
  score 0 and are marked `unavailable`. When the LLM is unavailable a lexical heuristic estimates completeness and
  clarity from length/structure and caps technical/conceptual at 6 — it is explicitly flagged `heuristic` and the
  UI/PDF warn that correctness was not verified. Speech fluency is never used as a proxy for knowledge.
* **Policy.** `DifficultyPolicy.decide(score, current)` maps `score ≤ ADAPTIVE_DECREASE_MAX` (default 4) to one
  level easier, `score ≥ ADAPTIVE_INCREASE_MIN` (default 8) to one level harder, otherwise holds, clamped to
  `easy → medium → hard`. Thresholds come from settings; `adaptive=false` per session yields a fixed policy.
* **Round aggregation.** Per-criterion averages, 0–100 round score, strengths/gaps/learning topics collected from
  answers, provenance (`llm` / `mixed` / `heuristic` / `unavailable`) and the difficulty trace.

## 6. Voice pipeline

Browser `MediaRecorder` (WebM/Opus, 400 ms chunks) + RMS silence detection → base64 chunks over WebSocket →
Deepgram Nova-2 transcription on `silence_detected` → orchestrator turn → ElevenLabs TTS (MP3) with Google TTS
fallback → sequential client playback → `playback_finished` → `listening`. A per-session lock serialises turns; turn
ids prevent duplicate rendering; text input is available in every state so the interview never stalls.

## 7. Persistence and reporting

Every asked question is upserted into `interview_questions` (question, answer, four rubric scores, overall, next
difficulty, full evaluation JSON, retrieval sources, latencies, provenance). Rounds are stored in
`round_transcripts`; sessions carry their configuration, persona, mode, duration and total questions. The report
agent assembles `report_data` (candidate, session, rounds, rubric averages, skill-wise performance, difficulty
trace, question-wise feedback, provenance, narrative) and renders the PDF from the same structure; the narrative
source (`llm`/`fallback`) is recorded.

## 8. Experimental design

| # | Question | Design | Metrics |
|---|---|---|---|
| 1 | Does resume grounding make questions more relevant? | Same candidates/roles under `generic`, `structured`, `rag` generation | resume-term overlap, entity-mention rate, citation rate |
| 2 | How good is retrieval? | 18 labelled queries over 5 synthetic resumes; section-aware vs naive fixed-size chunking | Precision@K, Recall@K (K=1..3), leakage, latency |
| 3 | Does adaptive difficulty help? | 200 simulated candidates with latent ability through the production policy vs fixed levels | Spearman ρ (ability vs score), MAE, time at target level |
| 4 | Do AI scores agree with humans? | Human ratings CSV (template) scored by the evaluation agent | Pearson r, Spearman ρ, MAE, weighted κ |
| 5 | Latency and completion | Persisted latencies and session statuses from the real database; STT latency from logs | mean/p50/p95 ms, completion rate |

All scripts record the runtime environment (LLM availability, embedding backend) so results obtained in degraded
mode are never confused with live-model results. See `EXPERIMENTAL_RESULTS.md`.

## 9. Testing methodology

Unit tests for the policy, evaluator, generator, chunker, embeddings, FAISS store and RAG service; graph-level
tests driving the LangGraph through open → answer → conclude → finalize; API tests for validation, security
headers, rate limiting, uploads, deletion; a WebSocket integration test running a full text interview through the
real orchestrator with persistence and reconnection; and a live HTTP/WebSocket smoke script against a running
server. Details in `TESTING_REPORT.md`.
