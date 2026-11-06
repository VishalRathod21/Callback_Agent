"""LangGraph interview turn graph.

Every interaction with the interview engine is one invocation of this graph.
The ``phase`` field of the state selects the entry path:

    phase="open"      START → select_agent ──► technical_agent | hr_agent | dsa_agent → END
    phase="answer"    START → evaluate_answer → adapt_difficulty → check_progress
                                 ├─(more questions)─► select_agent → <round agent> → END
                                 └─(limit reached)──► conclude_round → END
    phase="finalize"  START → finalize_round → END

Shared state is a single ``InterviewState`` TypedDict; agents never call each
other — the graph (orchestrator) routes between them with conditional edges.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from core.config import settings
from agents.difficulty_policy import DifficultyPolicy, normalize_level
from agents.evaluation_agent import EvaluationAgent
from agents.question_generator import QuestionGenerator, plan_categories

logger = logging.getLogger(__name__)


class InterviewState(TypedDict, total=False):
    # identity
    session_id: str
    candidate_id: str
    user_id: str
    target_role: str
    job_description: str
    resume_structured: dict
    persona: dict
    # configuration
    config: dict                     # rounds, questions_per_round, difficulty, mode, adaptive, duration_minutes
    rounds_queue: list[str]
    current_round: str               # "dsa" | "technical" | "hr" | "complete"
    status: str                      # "active" | "complete" | "cancelled"
    # adaptive engine
    current_difficulty: str
    category_plan: list[str]
    # per-round working memory
    questions: list[dict]            # question records of the current round
    conversation_history: list[dict] # [{speaker, text}]
    asked_questions_all: list[str]   # across rounds (dedupe)
    # results
    round_scores: dict
    round_results: dict
    overall_score: float
    # DSA (REST) round memory
    dsa_problems_total: int
    dsa_problems_completed: int
    dsa_submissions: list[dict]
    current_dsa_problem: dict | None
    dsa_hints_used: int
    # turn I/O
    phase: str                       # "open" | "answer" | "finalize"
    candidate_answer: str
    next_question: dict | None
    last_evaluation: dict | None
    round_should_end: bool
    closing_message: str
    last_message: str
    turn_counter: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _questions_per_round(state: InterviewState) -> int:
    cfg = state.get("config") or {}
    return int(cfg.get("questions_per_round") or settings.DEFAULT_QUESTIONS_PER_ROUND)


def _is_adaptive(state: InterviewState) -> bool:
    cfg = state.get("config") or {}
    return bool(cfg.get("adaptive", True)) and settings.ADAPTIVE_ENABLED


ROUND_AGENT_NODES = {"technical": "technical_agent", "hr": "hr_agent", "dsa": "dsa_agent"}


class InterviewGraph:
    """Builds and runs the compiled LangGraph for interview turns."""

    def __init__(self, question_generator: QuestionGenerator, evaluation_agent: EvaluationAgent,
                 llm_service=None, tech_agent=None, hr_agent=None, dsa_agent=None) -> None:
        self.qgen = question_generator
        self.evaluator = evaluation_agent
        self.llm_service = llm_service
        self.tech_agent = tech_agent
        self.hr_agent = hr_agent
        self.dsa_agent = dsa_agent
        self.graph = self._build()

    # ── Graph construction ─────────────────────────────────────────────────
    def _build(self):
        g = StateGraph(InterviewState)
        g.add_node("evaluate_answer", self.evaluate_answer)
        g.add_node("adapt_difficulty", self.adapt_difficulty)
        g.add_node("technical_agent", self.technical_agent)
        g.add_node("hr_agent", self.hr_agent_node)
        g.add_node("dsa_agent", self.dsa_agent_node)
        g.add_node("conclude_round", self.conclude_round)
        g.add_node("finalize_round", self.finalize_round)

        # Entry routing (phase) – LangGraph needs a concrete node for conditional entry
        g.add_node("entry", lambda state: {})
        g.add_edge(START, "entry")
        g.add_conditional_edges(
            "entry", self.route_phase,
            {
                "open": "select_agent",
                "answer": "evaluate_answer",
                "finalize": "finalize_round",
            },
        )
        # Agent selection is itself a routing node
        g.add_node("select_agent", lambda state: {})
        g.add_conditional_edges("select_agent", self.route_agent, ROUND_AGENT_NODES)

        g.add_edge("evaluate_answer", "adapt_difficulty")
        g.add_conditional_edges(
            "adapt_difficulty", self.check_progress,
            {"continue": "select_agent", "conclude": "conclude_round"},
        )
        for node in ROUND_AGENT_NODES.values():
            g.add_edge(node, END)
        g.add_edge("conclude_round", END)
        g.add_edge("finalize_round", END)
        return g.compile()

    # ── Routers ────────────────────────────────────────────────────────────
    @staticmethod
    def route_phase(state: InterviewState) -> str:
        phase = state.get("phase") or "open"
        if phase not in ("open", "answer", "finalize"):
            raise ValueError(f"Unknown phase: {phase}")
        return phase

    @staticmethod
    def route_agent(state: InterviewState) -> str:
        rnd = state.get("current_round") or "technical"
        return rnd if rnd in ROUND_AGENT_NODES else "technical"

    @staticmethod
    def check_progress(state: InterviewState) -> str:
        answered = sum(1 for q in state.get("questions", []) if q.get("answer") is not None)
        if answered >= _questions_per_round(state):
            return "conclude"
        return "continue"

    # ── Nodes ──────────────────────────────────────────────────────────────
    async def evaluate_answer(self, state: InterviewState) -> dict:
        questions = list(state.get("questions", []))
        answer = (state.get("candidate_answer") or "").strip()
        if not questions:
            logger.warning("[%s] answer received before any question was asked", state.get("session_id"))
            return {"last_evaluation": None, "conversation_history": state.get("conversation_history", [])}

        current = dict(questions[-1])
        if current.get("answer") is not None:
            # Duplicate submission for an already-answered question — ignore, keep state.
            return {"last_evaluation": current.get("evaluation")}

        resume_context = None
        if self.qgen.rag and state.get("candidate_id"):
            try:
                chunks = await self.qgen.rag.retrieve(state["candidate_id"], current["question"] + " " + answer[:300], k=2)
                resume_context = self.qgen.rag.build_context_block(chunks, max_chars=900) if chunks else None
            except Exception:  # noqa: BLE001
                resume_context = None

        policy = DifficultyPolicy(enabled=_is_adaptive(state))
        evaluation = await self.evaluator.evaluate_answer(
            current["question"], answer,
            round_name=state.get("current_round", "technical"),
            target_role=state.get("target_role", "Software Engineer"),
            difficulty=current.get("difficulty", state.get("current_difficulty", "medium")),
            category=current.get("category"),
            resume_context=resume_context,
            policy=policy,
        )
        current["answer"] = answer
        current["answered_at"] = _now_iso()
        current["evaluation"] = evaluation
        questions[-1] = current

        history = list(state.get("conversation_history", []))
        history.append({"speaker": "candidate", "text": answer})
        logger.info("[%s] evaluated Q%d: overall=%.1f source=%s next=%s",
                    state.get("session_id"), current.get("index", 0), evaluation["overall_score"],
                    evaluation["evaluation_source"], evaluation["next_difficulty"])
        return {"questions": questions, "last_evaluation": evaluation, "conversation_history": history,
                "candidate_answer": ""}

    async def adapt_difficulty(self, state: InterviewState) -> dict:
        evaluation = state.get("last_evaluation")
        current = normalize_level(state.get("current_difficulty"))
        if not evaluation:
            return {"current_difficulty": current}
        nxt = normalize_level(evaluation.get("next_difficulty"), default=current) if _is_adaptive(state) else current
        if nxt != current:
            logger.info("[%s] difficulty %s → %s (%s)", state.get("session_id"), current, nxt,
                        (evaluation.get("policy_decision") or {}).get("reason"))
        return {"current_difficulty": nxt}

    async def _generate_for_round(self, state: InterviewState, round_name: str, extra_persona: dict | None) -> dict:
        questions = list(state.get("questions", []))
        total = _questions_per_round(state)
        index = len(questions)
        plan = state.get("category_plan") or plan_categories(
            state.get("target_role", ""), state.get("resume_structured"), round_name, total
        )
        category = plan[index % len(plan)] if plan else "resume_projects"
        last_q = questions[-1] if questions else None
        cfg = state.get("config") or {}

        generated = await self.qgen.generate(
            round_name=round_name,
            target_role=state.get("target_role", "Software Engineer"),
            candidate_id=state.get("candidate_id"),
            resume_structured=state.get("resume_structured"),
            difficulty=state.get("current_difficulty", cfg.get("difficulty", "medium")),
            category=category,
            question_number=index + 1,
            total_questions=total,
            asked_questions=list(state.get("asked_questions_all", [])),
            last_question=last_q["question"] if last_q else None,
            last_answer=last_q.get("answer") if last_q else None,
            last_evaluation=last_q.get("evaluation") if last_q else None,
            job_description=cfg.get("job_description") or state.get("job_description"),
            persona=extra_persona or state.get("persona"),
            use_rag=cfg.get("use_rag", True),
        )
        record = {
            "index": index,
            "round": round_name,
            "question": generated["question"],
            "category": generated["category"],
            "difficulty": generated["difficulty"],
            "is_follow_up": generated["is_follow_up"],
            "rationale": generated.get("rationale"),
            "retrieval_sources": generated.get("retrieval_sources", []),
            "generation_source": generated.get("generation_source"),
            "generation_latency_ms": generated.get("generation_latency_ms"),
            "asked_at": _now_iso(),
            "answer": None,
            "evaluation": None,
        }
        # Opening question gets a short spoken intro
        text = generated["question"]
        if index == 0:
            intro = self._intro(round_name, state)
            if intro:
                text = f"{intro} {text}"
        record["spoken_text"] = text
        questions.append(record)
        history = list(state.get("conversation_history", []))
        history.append({"speaker": "interviewer", "text": text})
        asked_all = list(state.get("asked_questions_all", [])) + [generated["question"]]
        return {
            "questions": questions,
            "conversation_history": history,
            "asked_questions_all": asked_all,
            "category_plan": plan,
            "next_question": record,
            "round_should_end": False,
            "turn_counter": int(state.get("turn_counter", 0)) + 1,
            "last_message": f"Asked {round_name} question {index + 1}/{total} ({generated['difficulty']}, {category}).",
        }

    @staticmethod
    def _intro(round_name: str, state: InterviewState) -> str:
        role = state.get("target_role", "this role")
        persona = (state.get("persona") or {}).get("name", "your interviewer")
        if round_name == "technical":
            return f"Welcome to the technical round for the {role} position. I'm {persona}. Let's begin."
        if round_name == "hr":
            return "Thanks for joining the behavioural round. I'd like to hear about real situations from your experience."
        if round_name == "dsa":
            return "Let's start with some algorithmic thinking."
        return ""

    async def technical_agent(self, state: InterviewState) -> dict:
        persona = state.get("persona")
        if self.tech_agent is not None:
            persona = self.tech_agent.persona_for_prompt(persona)
        return await self._generate_for_round(state, "technical", persona)

    async def hr_agent_node(self, state: InterviewState) -> dict:
        persona = {"name": "HR Interviewer",
                   "description": "Warm, professional. Asks for concrete situations, actions and results (STAR) without naming the framework."}
        if self.hr_agent is not None:
            persona = self.hr_agent.persona_for_prompt(persona)
        return await self._generate_for_round(state, "hr", persona)

    async def dsa_agent_node(self, state: InterviewState) -> dict:
        persona = {"name": "DSA Interviewer",
                   "description": "Precise. Asks conceptual algorithm questions about complexity, data-structure choice and edge cases."}
        return await self._generate_for_round(state, "dsa", persona)

    async def conclude_round(self, state: InterviewState) -> dict:
        round_name = state.get("current_round", "technical")
        answered = [q for q in state.get("questions", []) if q.get("evaluation")]
        avg = (sum(q["evaluation"]["overall_score"] for q in answered) / len(answered)) if answered else None
        message = self._closing_message(round_name, avg)
        if self.llm_service is not None and getattr(self.llm_service, "available", False):
            try:
                prompt = (
                    f"You are concluding the {round_name} round of a mock interview. Write ONE warm, professional "
                    f"closing sentence (max 30 words) thanking the candidate and saying the round is complete. "
                    f"Do not mention scores. Return plain text only."
                )
                text = (await self.llm_service.generate(prompt, temperature=0.5)).strip().split("\n")[0]
                if 10 < len(text) < 240:
                    message = text
            except Exception:  # noqa: BLE001
                pass
        history = list(state.get("conversation_history", []))
        history.append({"speaker": "interviewer", "text": message})
        return {"closing_message": message, "round_should_end": True, "next_question": None,
                "conversation_history": history, "last_message": f"Round '{round_name}' reached its question limit."}

    @staticmethod
    def _closing_message(round_name: str, avg: float | None) -> str:
        label = {"technical": "technical", "hr": "behavioural", "dsa": "algorithms"}.get(round_name, round_name)
        return f"Thank you — that completes the {label} round. I'll compile the evaluation for this round now."

    async def finalize_round(self, state: InterviewState) -> dict:
        round_name = state.get("current_round", "technical")
        questions = state.get("questions", [])
        evaluations = [q.get("evaluation") for q in questions if q.get("evaluation")]
        summary = self.evaluator.aggregate_round(evaluations, round_name)
        summary["questions"] = questions
        summary["transcript"] = "\n".join(
            f"{'Interviewer' if e['speaker'] == 'interviewer' else 'Candidate'}: {e['text']}"
            for e in state.get("conversation_history", [])
        )
        summary["completed_at"] = _now_iso()
        try:
            from core.communication_analyzer import analyze_communication
            summary["communication_analysis"] = analyze_communication(summary["transcript"])
        except Exception:  # noqa: BLE001
            pass

        round_results = {**state.get("round_results", {}), round_name: summary}
        round_scores = dict(state.get("round_scores", {}))
        if summary.get("score") is not None:
            round_scores[round_name] = summary["score"]

        queue = list(state.get("rounds_queue", []))
        updates: dict[str, Any] = {
            "round_results": round_results,
            "round_scores": round_scores,
            "questions": [],
            "conversation_history": [],
            "category_plan": [],
            "next_question": None,
            "round_should_end": False,
            "closing_message": "",
        }
        if queue:
            nxt = queue.pop(0)
            updates.update({
                "rounds_queue": queue,
                "current_round": nxt,
                "status": "active",
                "current_difficulty": normalize_level((state.get("config") or {}).get("difficulty"), "medium"),
                "last_message": f"Round '{round_name}' finalised; next round: {nxt}.",
            })
            if nxt == "dsa":
                updates.update({"dsa_problems_completed": 0, "dsa_submissions": [], "current_dsa_problem": None,
                                "dsa_hints_used": 0})
        else:
            scored = [v for v in round_scores.values() if v is not None]
            overall = round(sum(scored) / len(scored), 2) if scored else 0.0
            updates.update({
                "rounds_queue": [],
                "current_round": "complete",
                "status": "complete",
                "overall_score": overall,
                "last_message": f"Interview complete. Overall score {overall:.1f}.",
            })
        logger.info("[%s] %s", state.get("session_id"), updates["last_message"])
        return updates

    # ── Public ─────────────────────────────────────────────────────────────
    async def run(self, state: InterviewState, phase: str, candidate_answer: str | None = None) -> InterviewState:
        payload: dict = {**state, "phase": phase}
        if candidate_answer is not None:
            payload["candidate_answer"] = candidate_answer
        result = await self.graph.ainvoke(payload)
        return result  # type: ignore[return-value]

    def describe(self) -> dict:
        """Topology description used by SYSTEM_ARCHITECTURE.md and the /graph endpoint."""
        return {
            "nodes": ["entry", "select_agent", "technical_agent", "hr_agent", "dsa_agent",
                      "evaluate_answer", "adapt_difficulty", "conclude_round", "finalize_round"],
            "edges": [
                ("START", "entry"), ("entry", "select_agent [phase=open]"),
                ("entry", "evaluate_answer [phase=answer]"), ("entry", "finalize_round [phase=finalize]"),
                ("select_agent", "technical_agent | hr_agent | dsa_agent [current_round]"),
                ("evaluate_answer", "adapt_difficulty"),
                ("adapt_difficulty", "select_agent [answered < limit]"),
                ("adapt_difficulty", "conclude_round [answered >= limit]"),
                ("technical_agent | hr_agent | dsa_agent", "END"), ("conclude_round", "END"), ("finalize_round", "END"),
            ],
        }
