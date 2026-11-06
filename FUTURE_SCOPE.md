# Future Scope and Limitations

## Known limitations (current implementation)

1. **Code is not executed.** DSA submissions are evaluated by LLM static reasoning, not by running test cases.
2. **LLM-as-judge.** Answer scoring depends on the configured model; without a key the system falls back to a
   lexical heuristic that cannot verify technical correctness (flagged everywhere, but still a limitation).
3. **Embeddings offline fallback is lexical.** The feature-hashing backend captures vocabulary overlap, not
   paraphrase; semantic retrieval needs the Gemini embedding backend.
4. **Human-agreement study not yet run.** `experiments/human_ratings.csv` must be filled by human raters; the
   script and metrics are in place.
5. **Single-process state.** Orchestrator sessions, practice sessions and debrief conversations live in process
   memory (interview state is restorable from the database; practice/debrief are not).
6. **Voice latency.** STT and TTS are request/response calls; there is no streaming transcription or streamed audio.
7. **No e-mail delivery.** Password-reset and verification tokens are logged, not mailed.

## Proposed extensions

### Assessment quality
* Sandboxed code execution (e.g. containerised runners) with hidden test cases to ground DSA correctness.
* Ensemble / self-consistency evaluation and calibration against the human-rated dataset; per-criterion reliability
  analysis (Krippendorff's α across raters).
* Item-response-theory (IRT) based ability estimation to replace the threshold policy with a Bayesian difficulty
  selector; question difficulty parameters learned from accumulated answers.
* Confidence-aware scoring that reports uncertainty alongside each rubric score.

### Retrieval and personalisation
* Hybrid retrieval (BM25 + dense) with cross-encoder re-ranking; per-section embedding models.
* Job-description indexing to align questions with the posting as well as the resume.
* Long-term learner model across sessions (spaced repetition of weak categories).

### Agents and orchestration
* LangGraph checkpointing (`SqliteSaver`/`PostgresSaver`) so graph state itself is persisted, plus human-in-the-loop
  interrupts for a mentor to inject questions.
* Additional specialised agents: system-design whiteboard agent, case-study agent for product roles.
* Agent-level observability (LangSmith tracing) and prompt versioning with offline evaluation sets.

### Voice and realism
* Streaming STT (Deepgram live) and streaming TTS for sub-second turn latency; barge-in handling.
* Prosody/pace analytics as *separate* communication signals, never merged into technical scores.
* Optional video presence analysis with explicit consent.

### Platform
* Redis-backed session store and horizontal scaling of the WebSocket tier.
* Role-based access for recruiters/mentors to review candidate reports; cohort analytics.
* Internationalisation and multilingual interviews (ElevenLabs multilingual TTS is already used).
* Accessibility audit (WCAG 2.2 AA) and keyboard-only interview flow.
* Mobile apps using the same REST/WebSocket contract.

### Research directions
* Measure whether adaptive difficulty improves learning outcomes (pre/post-test design with real candidates).
* Study hallucination/over-grounding in resume-aware questions (does the model invent experience?) using the stored
  `retrieval_sources` and `grounded_in` fields.
* Fairness analysis of evaluation scores across demographic proxies and languages.
