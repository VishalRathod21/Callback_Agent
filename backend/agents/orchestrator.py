"""Interview orchestrator built on LangGraph.

Manages the state machine for multi-round interviews:
    start_round → evaluate_round → (more rounds?) → calculate_final_score → complete

Active session states are stored in-memory (dict) for now, with Redis as a
planned future backend.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


# ── State Schema ───────────────────────────────────────────────────────────────


class InterviewState(TypedDict):
    """Full state of an interview session flowing through the graph."""

    candidate_id: str
    session_id: str
    target_role: str
    resume_text: str
    current_round: str          # "dsa" | "technical" | "hr" | "complete"
    rounds_queue: list[str]     # remaining rounds to run
    round_scores: dict          # {"dsa": 72.0, ...}
    round_transcripts: dict     # {"dsa": {"transcript": "...", "evaluation": {...}}, ...}
    overall_score: float
    status: str                 # "active" | "complete" | "failed"
    last_message: str
    dsa_problems_total: int
    dsa_problems_completed: int
    dsa_submissions: list[dict]
    persona: dict


# ── Graph Node Functions ───────────────────────────────────────────────────────


def _start_round(state: InterviewState) -> dict:
    """Advance to the next round in the queue.

    Pops the first entry from `rounds_queue` and sets it as
    `current_round`.  The actual interview interaction happens
    externally (e.g. via WebSocket); this node just sets up state.
    """
    rounds_queue = list(state["rounds_queue"])

    if not rounds_queue:
        return {
            "current_round": "complete",
            "status": "complete",
            "last_message": "All rounds completed.",
        }

    next_round = rounds_queue.pop(0)

    logger.info(
        "Session %s — starting round: %s (remaining: %s)",
        state["session_id"], next_round, rounds_queue,
    )

    updates = {
        "current_round": next_round,
        "rounds_queue": rounds_queue,
        "status": "active",
        "last_message": f"Round '{next_round}' is now active. Awaiting candidate interaction.",
    }

    if next_round == "dsa":
        updates["dsa_problems_completed"] = 0
        updates["dsa_problems_total"] = 2
        updates["dsa_submissions"] = []

    return updates


def _evaluate_round(state: InterviewState) -> dict:
    """Evaluate the current round.

    By the time this node runs, the round transcript and score should
    already have been injected into state via `submit_round_result`.
    This node simply logs the evaluation and prepares for routing.
    """
    current = state["current_round"]
    score = state["round_scores"].get(current)

    logger.info(
        "Session %s — evaluated round '%s': score=%.1f",
        state["session_id"], current, score or 0.0,
    )

    return {
        "last_message": (
            f"Round '{current}' evaluated with score {score:.1f}."
            if score is not None
            else f"Round '{current}' evaluated (no score provided)."
        ),
    }


def _calculate_final_score(state: InterviewState) -> dict:
    """Calculate the weighted overall score from all round scores.

    Current strategy: simple average of all round scores.
    Can be extended with per-round weights based on `target_role`.
    """
    scores = state["round_scores"]

    if not scores:
        overall = 0.0
    else:
        overall = round(sum(scores.values()) / len(scores), 2)

    logger.info(
        "Session %s — final score: %.2f (from %d rounds)",
        state["session_id"], overall, len(scores),
    )

    return {
        "overall_score": overall,
        "last_message": f"Final score calculated: {overall:.2f} from {len(scores)} round(s).",
    }


def _complete(state: InterviewState) -> dict:
    """Terminal node — marks the session as complete."""
    logger.info(
        "Session %s — interview complete. Overall: %.2f",
        state["session_id"], state["overall_score"],
    )

    return {
        "current_round": "complete",
        "status": "complete",
        "last_message": (
            f"Interview complete. Overall score: {state['overall_score']:.2f}."
        ),
    }


# ── Conditional Routing ────────────────────────────────────────────────────────


def _should_continue_or_finalise(state: InterviewState) -> str:
    """Route after evaluate_round.

    If there are more rounds queued, loop back to `start_round`.
    Otherwise, proceed to `calculate_final_score`.
    """
    if state["rounds_queue"]:
        return "start_round"
    return "calculate_final_score"


# ── Orchestrator Class ─────────────────────────────────────────────────────────


class InterviewOrchestrator:
    """Manages multi-round interview sessions using a LangGraph state machine.

    Usage::

        orch = InterviewOrchestrator()

        # 1. Start a session
        state = await orch.start_session(
            candidate_id="...", session_id="...",
            rounds_queue=["dsa", "technical", "hr"],
            target_role="Backend Engineer",
            resume_text="...",
        )

        # 2. After each round completes externally, submit the result
        state = await orch.submit_round_result(
            state, round_name="dsa",
            transcript="...", score=78.5, evaluation={...},
        )

        # 3. Query state at any time
        state = await orch.get_state(session_id)
    """

    def __init__(self) -> None:
        self._graph = self._build_graph()
        # In-memory session store  (session_id → InterviewState)
        self._sessions: dict[str, InterviewState] = {}

    # ── Graph Construction ─────────────────────────────────────────────

    @staticmethod
    def _build_graph():
        """Build and compile the interview state graph.

        Graph topology::

            START → start_round → evaluate_round ─┐
                        ↑                          │
                        └── (more rounds?) ────────┘
                                    │ (no more rounds)
                                    ↓
                          calculate_final_score → complete → END
        """
        graph = StateGraph(InterviewState)

        # Nodes
        graph.add_node("start_round", _start_round)
        graph.add_node("evaluate_round", _evaluate_round)
        graph.add_node("calculate_final_score", _calculate_final_score)
        graph.add_node("complete", _complete)

        # Edges
        graph.add_edge(START, "start_round")
        graph.add_edge("start_round", "evaluate_round")
        graph.add_conditional_edges(
            "evaluate_round",
            _should_continue_or_finalise,
            {
                "start_round": "start_round",
                "calculate_final_score": "calculate_final_score",
            },
        )
        graph.add_edge("calculate_final_score", "complete")
        graph.add_edge("complete", END)

        return graph.compile()

    # ── Public API ─────────────────────────────────────────────────────

    async def start_session(
        self,
        candidate_id: str,
        session_id: str,
        rounds_queue: list[str],
        target_role: str,
        resume_text: str,
    ) -> InterviewState:
        """Initialise a new interview session and advance to the first round.

        Args:
            candidate_id: UUID of the candidate.
            session_id: UUID of the interview session.
            rounds_queue: Ordered list of round names (e.g. ["dsa", "technical", "hr"]).
            target_role: The role the candidate is interviewing for.
            resume_text: Full text of the candidate's parsed resume.

        Returns:
            The initial InterviewState after the first round has been set up.
        """
        import random
        personas = [
            {
                "name": "Senior Staff Engineer",
                "description": "Direct and rigorous. Focuses on code efficiency, correctness, cleanliness, and direct feedback."
            },
            {
                "name": "Collaborative Mentor",
                "description": "Encourages discussion, friendly, supportive, and asks guiding questions to help the candidate arrive at the solution."
            },
            {
                "name": "Deep-Dive Architect",
                "description": "Constantly asks 'why', explores scalability, system design tradeoffs, design patterns, and alternative architectures."
            },
            {
                "name": "Fast-Paced Startup Interviewer",
                "description": "Moves rapidly between topics, focuses on speed, delivery, pragmatism, and quick, practical problem-solving."
            },
            {
                "name": "Research-Oriented Interviewer",
                "description": "Focuses heavily on fundamental reasoning, first-principles thinking, complexity theory, and deep theoretical understanding."
            }
        ]
        selected_persona = random.choice(personas)

        initial_state: InterviewState = {
            "candidate_id": candidate_id,
            "session_id": session_id,
            "target_role": target_role,
            "resume_text": resume_text,
            "current_round": "",
            "rounds_queue": list(rounds_queue),
            "round_scores": {},
            "round_transcripts": {},
            "overall_score": 0.0,
            "status": "active",
            "last_message": "Session initialised.",
            "dsa_problems_total": 0,
            "dsa_problems_completed": 0,
            "dsa_submissions": [],
            "persona": selected_persona,
        }

        # Manually build the initial state — we do NOT invoke the full graph here
        # because the graph has no blocking checkpoint and would run straight
        # through to _complete, ending the interview before it begins.
        # Instead we pop the first round manually and store the rest in the queue.
        state: InterviewState = {**initial_state}

        # Pop first round
        if rounds_queue:
            first_round = state["rounds_queue"].pop(0)
            state["current_round"] = first_round
            state["status"] = "active"
            state["last_message"] = (
                f"Round '{first_round}' is now active. Awaiting candidate interaction."
            )
            if first_round == "dsa":
                state["dsa_problems_completed"] = 0
                state["dsa_problems_total"] = 2
                state["dsa_submissions"] = []

        self._sessions[session_id] = state

        logger.info(
            "Session %s started for candidate %s — first round: %s",
            session_id, candidate_id, state["current_round"],
        )

        return state

    async def submit_round_result(
        self,
        state: InterviewState,
        round_name: str,
        transcript: str,
        score: float,
        evaluation: dict,
    ) -> InterviewState:
        """Submit the result of a completed round and advance the state machine.

        After the external interview interaction completes (e.g. via WebSocket
        or API call), call this method with the transcript and evaluation.
        The orchestrator will:
        1. Record the round result in state.
        2. Run evaluate_round.
        3. Either advance to the next round or calculate the final score.

        Args:
            state: The current InterviewState.
            round_name: Name of the round that was completed.
            transcript: Full conversation transcript for the round.
            score: Numeric score (0-100) for the round.
            evaluation: AI evaluation dict for the round.

        Returns:
            Updated InterviewState after processing.
        """
        session_id = state["session_id"]

        # Inject round results into state
        updated_scores = {**state["round_scores"], round_name: score}
        updated_transcripts = {
            **state["round_transcripts"],
            round_name: {
                "transcript": transcript,
                "evaluation": evaluation,
                "score": score,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
        }

        state = {
            **state,
            "round_scores": updated_scores,
            "round_transcripts": updated_transcripts,
        }

        logger.info(
            "Session %s — round '%s' result submitted (score: %.1f)",
            session_id, round_name, score,
        )

        # Run evaluate_round → conditional → (start_round | calculate_final_score → complete)
        # We step through the remaining graph nodes manually for control.

        # Step 1: evaluate_round
        eval_updates = _evaluate_round(state)
        state = {**state, **eval_updates}

        # Step 2: check if more rounds
        if state["rounds_queue"]:
            # More rounds — advance to next round
            round_updates = _start_round(state)
            state = {**state, **round_updates}
        else:
            # All rounds done — calculate final score and complete
            score_updates = _calculate_final_score(state)
            state = {**state, **score_updates}
            complete_updates = _complete(state)
            state = {**state, **complete_updates}

        # Persist updated state
        self._sessions[session_id] = state

        return state

    async def get_state(self, session_id: str, db = None) -> InterviewState:
        """Retrieve the current state of an interview session.

        Args:
            session_id: UUID of the session to look up.
            db: Optional AsyncSession to restore session if not found in memory.

        Returns:
            The current InterviewState.

        Raises:
            KeyError: If no session with the given ID exists.
        """
        if session_id not in self._sessions:
            if db is not None:
                await self.restore_session(session_id, db)
            else:
                raise KeyError(f"No active session found with ID: {session_id}")

        return self._sessions[session_id]

    async def restore_session(self, session_id: str, db) -> None:
        """Restore an interview session state from the database.

        Args:
            session_id: UUID of the session to look up.
            db: AsyncSession to query the database.
        """
        import json
        import random
        from sqlalchemy import select
        from core.models import InterviewSession, Candidate, RoundTranscript, RoundName, SessionStatus

        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            raise KeyError(f"Invalid session ID format: {session_id}")

        session = await db.get(InterviewSession, sid)
        if not session:
            raise KeyError(f"No session found in DB with ID: {session_id}")

        candidate = await db.get(Candidate, session.candidate_id)
        if not candidate:
            raise KeyError(f"No candidate found for session: {session_id}")

        # Try to retrieve resume text from FAISS or disk fallback
        resume_text = ""
        try:
            from services.faiss_service import FAISSService
            faiss_service = FAISSService()
            res = await faiss_service.get(collection="resumes", doc_id=str(candidate.id))
            if res and res.get("text"):
                resume_text = res["text"]
        except Exception as exc:
            logger.warning("Failed to retrieve resume from FAISS: %s", exc)

        if not resume_text and candidate.resume_path:
            from services import resume_parser
            try:
                parsed = await resume_parser.parse_resume(candidate.resume_path)
                resume_text = parsed.get("raw_text", "")
            except Exception as exc:
                logger.error("Failed to parse resume from disk fallback: %s", exc)

        current_round_str = session.current_round.value
        # Reconstruct rounds queue based on current round
        if current_round_str == "dsa":
            rounds_queue = ["technical", "hr"]
        elif current_round_str == "technical":
            rounds_queue = ["hr"]
        else:
            rounds_queue = []

        # Get round transcripts to recover completed rounds, scores, and dsa submissions
        transcripts_result = await db.execute(
            select(RoundTranscript)
            .where(RoundTranscript.session_id == sid)
            .order_by(RoundTranscript.created_at.asc())
        )
        transcripts = list(transcripts_result.scalars().all())

        round_scores = session.round_scores or {}
        round_transcripts = {}
        dsa_submissions = []
        dsa_problems_completed = 0

        for t in transcripts:
            if t.round_name == "dsa":
                try:
                    data = json.loads(t.transcript)
                    if isinstance(data, dict) and "evaluation" in data:
                        dsa_submissions.append(data["evaluation"])
                        dsa_problems_completed += 1
                except Exception:
                    pass
            else:
                if t.round_name not in round_scores and t.score is not None:
                    round_scores[t.round_name] = float(t.score)
                round_transcripts[t.round_name] = {
                    "transcript": t.transcript,
                    "evaluation": t.ai_evaluation,
                    "score": t.score,
                    "completed_at": t.created_at.isoformat() if t.created_at else None
                }

        personas = [
            {
                "name": "Senior Staff Engineer",
                "description": "Direct and rigorous. Focuses on code efficiency, correctness, cleanliness, and direct feedback."
            },
            {
                "name": "Collaborative Mentor",
                "description": "Encourages discussion, friendly, supportive, and asks guiding questions to help the candidate arrive at the solution."
            },
            {
                "name": "Deep-Dive Architect",
                "description": "Constantly asks 'why', explores scalability, system design tradeoffs, design patterns, and alternative architectures."
            },
            {
                "name": "Fast-Paced Startup Interviewer",
                "description": "Moves rapidly between topics, focuses on speed, delivery, pragmatism, and quick, practical problem-solving."
            },
            {
                "name": "Research-Oriented Interviewer",
                "description": "Focuses heavily on fundamental reasoning, first-principles thinking, complexity theory, and theoretical understanding."
            }
        ]
        selected_persona = random.choice(personas)

        state: InterviewState = {
            "candidate_id": str(candidate.id),
            "session_id": session_id,
            "target_role": candidate.target_role or "Software Engineer",
            "resume_text": resume_text,
            "current_round": current_round_str,
            "rounds_queue": rounds_queue,
            "round_scores": round_scores,
            "round_transcripts": round_transcripts,
            "overall_score": session.overall_score or 0.0,
            "status": session.status.value,
            "last_message": "Restored from database.",
            "dsa_problems_total": 2,
            "dsa_problems_completed": dsa_problems_completed,
            "dsa_submissions": dsa_submissions,
            "persona": selected_persona
        }

        self._sessions[session_id] = state
        logger.info("Restored session state for %s from database.", session_id)
