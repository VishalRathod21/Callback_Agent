"""Evaluation agent.

Scores a single candidate answer against the standard rubric and aggregates
per-answer scores into round-level results.

Rubric (weights configurable in settings, default 40/25/20/15):

    technical_correctness     — factual/technical accuracy of what was said
    conceptual_understanding  — does the candidate understand *why*
    answer_completeness       — coverage of the question's key points
    communication_clarity     — structure and clarity of the explanation

Every evaluation records ``evaluation_source``:

    "llm"        — produced by the configured LLM with evidence quotes
    "heuristic"  — produced by the local lexical heuristic because the LLM was
                   unavailable or failed; these scores are *not* a judgement of
                   technical correctness and are flagged as such in the UI
    "unavailable"— answer was empty / not evaluable

The agent never invents a confident score when it has no basis for one.
"""

from __future__ import annotations

import json
import logging
import re
import time

from core.config import settings
from services.llm_service import llm_service as global_llm_service, LLMUnavailableError
from agents.difficulty_policy import DifficultyPolicy, normalize_level, default_policy

logger = logging.getLogger(__name__)

RUBRIC_KEYS = ["technical_correctness", "conceptual_understanding", "answer_completeness", "communication_clarity"]

_SYSTEM_PROMPT = """\
You are a strict, fair technical interview evaluator. You score ONLY what the candidate actually said.
Rules:
- Judge technical content, not speaking fluency. A fluent but wrong answer scores low on technical_correctness.
- Never award points for content the candidate did not state. Missing parts lower answer_completeness.
- Short answers like "I don't know" or off-topic replies score 0-2 across the board.
- Quote 1-3 short pieces of evidence from the answer that justify your scores.
- Return ONLY a JSON object. No prose outside JSON.
"""

_EVAL_PROMPT = """\
INTERVIEW ROUND: {round_name}
TARGET ROLE: {target_role}
QUESTION DIFFICULTY: {difficulty}
QUESTION CATEGORY: {category}

QUESTION:
{question}

CANDIDATE ANSWER:
\"\"\"{answer}\"\"\"

{context_block}

Score each criterion from 0 to 10 (integers or one decimal):
- technical_correctness (weight {w_tech:.0%})
- conceptual_understanding (weight {w_concept:.0%})
- answer_completeness (weight {w_complete:.0%})
- communication_clarity (weight {w_comm:.0%})

Return JSON with exactly this schema:
{{
  "technical_correctness": <0-10>,
  "conceptual_understanding": <0-10>,
  "answer_completeness": <0-10>,
  "communication_clarity": <0-10>,
  "feedback": "<2-3 sentences, specific to this answer>",
  "strengths": ["<short phrase>", ...],
  "gaps": ["<missing or incorrect point>", ...],
  "evidence": ["<short quote from the answer>", ...],
  "ideal_answer_points": ["<key point a strong answer includes>", ...],
  "learning_topics": ["<topic to study>", ...]
}}
"""

_NON_ANSWER_PATTERNS = re.compile(
    r"^(i\s*(don'?t|do not)\s*know|no idea|not sure|skip|pass|idk|n/?a)\W*$", re.I
)


def weighted_overall(scores: dict) -> float:
    weights = settings.rubric_weights
    total = 0.0
    for key, w in weights.items():
        total += float(scores.get(key, 0) or 0) * w
    return round(total, 2)


def clamp_score(value, lo: float = 0.0, hi: float = 10.0) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    return round(max(lo, min(hi, v)), 1)


class EvaluationAgent:
    def __init__(self, llm_service=None, policy: DifficultyPolicy | None = None) -> None:
        self.llm_service = llm_service or global_llm_service
        self.policy = policy or default_policy

    # ── Single answer ──────────────────────────────────────────────────────
    async def evaluate_answer(
        self,
        question: str,
        answer: str,
        *,
        round_name: str = "technical",
        target_role: str = "Software Engineer",
        difficulty: str = "medium",
        category: str | None = None,
        resume_context: str | None = None,
        policy: DifficultyPolicy | None = None,
    ) -> dict:
        """Return a structured evaluation dict (see module docstring)."""
        policy = policy or self.policy
        difficulty = normalize_level(difficulty)
        answer = (answer or "").strip()
        started = time.monotonic()

        if not answer or len(answer) < 2 or _NON_ANSWER_PATTERNS.match(answer):
            result = self._empty_evaluation(difficulty, policy, reason="no substantive answer")
            result["evaluation_latency_ms"] = int((time.monotonic() - started) * 1000)
            return result

        context_block = ""
        if resume_context:
            context_block = f"RELEVANT RESUME CONTEXT (for checking consistency of claims):\n{resume_context}\n"

        prompt = _EVAL_PROMPT.format(
            round_name=round_name, target_role=target_role, difficulty=difficulty,
            category=category or "general", question=question, answer=answer[:6000],
            context_block=context_block,
            w_tech=settings.RUBRIC_WEIGHT_TECHNICAL, w_concept=settings.RUBRIC_WEIGHT_CONCEPTUAL,
            w_complete=settings.RUBRIC_WEIGHT_COMPLETENESS, w_comm=settings.RUBRIC_WEIGHT_COMMUNICATION,
        )

        try:
            raw = await self.llm_service.generate_json(prompt, system_instruction=_SYSTEM_PROMPT, temperature=0.2)
            result = self._normalise_llm_result(raw)
            result["evaluation_source"] = "llm"
        except LLMUnavailableError as exc:
            logger.info("Evaluation LLM unavailable (%s) — using heuristic scoring.", exc)
            result = self._heuristic_evaluation(question, answer)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Evaluation LLM call failed (%s) — using heuristic scoring.", exc)
            result = self._heuristic_evaluation(question, answer)

        result["overall_score"] = weighted_overall(result)
        decision = policy.decide(result["overall_score"], difficulty)
        result["difficulty"] = difficulty
        result["next_difficulty"] = decision.next
        result["policy_decision"] = decision.to_dict()
        result["rubric_weights"] = settings.rubric_weights
        result["evaluation_latency_ms"] = int((time.monotonic() - started) * 1000)
        return result

    def _normalise_llm_result(self, raw: dict) -> dict:
        result = {k: clamp_score(raw.get(k)) for k in RUBRIC_KEYS}
        result["feedback"] = str(raw.get("feedback") or "").strip()[:1200]
        for key in ("strengths", "gaps", "evidence", "ideal_answer_points", "learning_topics"):
            val = raw.get(key) or []
            if isinstance(val, str):
                val = [val]
            result[key] = [str(v).strip()[:300] for v in val if str(v).strip()][:8]
        return result

    def _empty_evaluation(self, difficulty: str, policy: DifficultyPolicy, reason: str) -> dict:
        result = {k: 0.0 for k in RUBRIC_KEYS}
        result.update({
            "feedback": "No substantive answer was given, so the question could not be evaluated.",
            "strengths": [], "gaps": ["No answer provided."], "evidence": [],
            "ideal_answer_points": [], "learning_topics": [],
            "evaluation_source": "unavailable",
            "overall_score": 0.0,
        })
        decision = policy.decide(0.0, difficulty)
        result["difficulty"] = difficulty
        result["next_difficulty"] = decision.next
        result["policy_decision"] = {**decision.to_dict(), "reason": f"{reason}; {decision.reason}"}
        result["rubric_weights"] = settings.rubric_weights
        return result

    @staticmethod
    def _heuristic_evaluation(question: str, answer: str) -> dict:
        """Lexical heuristic used only when the LLM is unavailable.

        It estimates completeness/clarity from length, structure and overlap
        with the question's key terms.  It CANNOT verify technical correctness,
        so technical_correctness and conceptual_understanding are set to the
        same conservative estimate and the result is flagged ``heuristic``.
        """
        words = re.findall(r"[a-zA-Z0-9+#.]+", answer.lower())
        n = len(words)
        q_terms = {w for w in re.findall(r"[a-zA-Z0-9+#.]+", question.lower()) if len(w) > 3}
        overlap = len(q_terms & set(words)) / max(1, len(q_terms))
        sentences = max(1, len(re.findall(r"[.!?]+", answer)))
        avg_len = n / sentences

        length_score = min(1.0, n / 120)                      # ~120 words ≈ full credit
        structure = 1.0 if 8 <= avg_len <= 30 else 0.6
        fillers = len(re.findall(r"\b(um|uh|like|you know|basically|actually)\b", answer.lower()))
        filler_penalty = min(0.4, fillers / max(1, n) * 10)

        completeness = clamp_score(10 * (0.6 * length_score + 0.4 * overlap))
        clarity = clamp_score(10 * max(0.0, structure - filler_penalty))
        # conservative: capped at 6 because correctness is unverified
        technical = clamp_score(min(6.0, 10 * (0.5 * overlap + 0.5 * length_score)))
        conceptual = technical

        return {
            "technical_correctness": technical,
            "conceptual_understanding": conceptual,
            "answer_completeness": completeness,
            "communication_clarity": clarity,
            "feedback": (
                "Heuristic estimate only: the AI evaluator was unavailable, so technical correctness "
                "could not be verified. Scores reflect answer length, structure and relevance to the "
                "question's key terms."
            ),
            "strengths": [], "gaps": [], "evidence": [],
            "ideal_answer_points": [], "learning_topics": [],
            "evaluation_source": "heuristic",
        }

    # ── Round aggregation ──────────────────────────────────────────────────
    @staticmethod
    def aggregate_round(evaluations: list[dict], round_name: str = "technical") -> dict:
        """Aggregate per-answer evaluations into a round summary (0-100 score)."""
        scored = [e for e in evaluations if e and e.get("overall_score") is not None]
        if not scored:
            return {
                "score": None, "questions_answered": 0, "rubric_averages": {k: None for k in RUBRIC_KEYS},
                "evaluation_source": "unavailable", "feedback": "No evaluated answers in this round.",
                "strengths": [], "weaknesses": [], "learning_topics": [],
            }
        rubric_avg = {
            k: round(sum(float(e.get(k, 0) or 0) for e in scored) / len(scored), 2) for k in RUBRIC_KEYS
        }
        overall_10 = sum(float(e["overall_score"]) for e in scored) / len(scored)
        sources = {e.get("evaluation_source", "llm") for e in scored}
        if sources == {"llm"}:
            source = "llm"
        elif "llm" in sources:
            source = "mixed"
        elif "heuristic" in sources:
            source = "heuristic"
        else:
            source = "unavailable"

        def _collect(key: str, limit: int) -> list[str]:
            seen: list[str] = []
            for e in scored:
                for item in e.get(key, []) or []:
                    if item and item not in seen:
                        seen.append(item)
            return seen[:limit]

        strengths = _collect("strengths", 5)
        weaknesses = _collect("gaps", 5)
        topics = _collect("learning_topics", 6)

        difficulty_trace = [e.get("difficulty") for e in scored if e.get("difficulty")]
        return {
            "score": round(overall_10 * 10, 1),
            "questions_answered": len(scored),
            "rubric_averages": rubric_avg,
            "evaluation_source": source,
            "feedback": EvaluationAgent._round_feedback(round_name, overall_10, rubric_avg, source),
            "strengths": strengths,
            "weaknesses": weaknesses,
            "learning_topics": topics,
            "difficulty_trace": difficulty_trace,
            "per_question": [
                {
                    "question_index": i,
                    "overall_score": e.get("overall_score"),
                    "difficulty": e.get("difficulty"),
                    "next_difficulty": e.get("next_difficulty"),
                    "evaluation_source": e.get("evaluation_source"),
                }
                for i, e in enumerate(scored)
            ],
        }

    @staticmethod
    def _round_feedback(round_name: str, overall_10: float, rubric_avg: dict, source: str) -> str:
        best = max(rubric_avg, key=lambda k: rubric_avg[k] or 0)
        worst = min(rubric_avg, key=lambda k: rubric_avg[k] or 0)
        pretty = lambda k: k.replace("_", " ")  # noqa: E731
        msg = (
            f"{round_name.capitalize()} round average {overall_10:.1f}/10. "
            f"Strongest criterion: {pretty(best)} ({rubric_avg[best]:.1f}); "
            f"weakest: {pretty(worst)} ({rubric_avg[worst]:.1f})."
        )
        if source != "llm":
            msg += " Note: some or all scores are heuristic estimates because the AI evaluator was unavailable."
        return msg


default_evaluation_agent = EvaluationAgent()
