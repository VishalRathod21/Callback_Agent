"""Unit tests for the adaptive engine: difficulty policy, evaluation agent, question generator, LangGraph graph."""

import pytest
from unittest.mock import AsyncMock

from agents.difficulty_policy import DifficultyPolicy, normalize_level, LEVELS
from agents.evaluation_agent import EvaluationAgent, weighted_overall, RUBRIC_KEYS
from agents.question_generator import QuestionGenerator, plan_categories, infer_categories, is_similar
from agents.interview_graph import InterviewGraph
from services.llm_service import LLMUnavailableError


# ── Difficulty policy ─────────────────────────────────────────────────────────

def test_policy_thresholds_default():
    p = DifficultyPolicy(decrease_max=4, increase_min=8, enabled=True)
    assert p.decide(3.9, "medium").next == "easy"
    assert p.decide(4.0, "medium").next == "easy"          # inclusive lower bound
    assert p.decide(5.0, "medium").next == "medium"
    assert p.decide(7.9, "medium").next == "medium"
    assert p.decide(8.0, "medium").next == "hard"          # inclusive upper bound
    assert p.decide(9.5, "hard").next == "hard"            # clamped
    assert p.decide(1.0, "easy").next == "easy"            # clamped
    assert p.decide(None, "hard").direction == "maintain"


def test_policy_is_configurable_and_can_be_disabled():
    p = DifficultyPolicy(decrease_max=2, increase_min=6)
    assert p.decide(3, "medium").next == "medium"
    assert p.decide(6, "medium").next == "hard"
    fixed = DifficultyPolicy(enabled=False)
    assert fixed.decide(10, "easy").next == "easy"
    assert fixed.decide(0, "hard").next == "hard"
    with pytest.raises(ValueError):
        DifficultyPolicy(decrease_max=8, increase_min=4)


def test_normalize_level_aliases():
    assert normalize_level("Advanced") == "hard"
    assert normalize_level("intermediate") == "medium"
    assert normalize_level("beginner") == "easy"
    assert normalize_level("medium/hard") == "hard"
    assert normalize_level(None) == "medium"
    assert set(LEVELS) == {"easy", "medium", "hard"}


# ── Evaluation agent ──────────────────────────────────────────────────────────

def test_weighted_overall_uses_configured_weights():
    scores = {"technical_correctness": 10, "conceptual_understanding": 10, "answer_completeness": 10, "communication_clarity": 0}
    assert weighted_overall(scores) == pytest.approx(8.5)   # 40 + 25 + 20 = 85% of 10
    assert weighted_overall({k: 8 for k in RUBRIC_KEYS}) == pytest.approx(8.0)


@pytest.mark.asyncio
async def test_evaluation_agent_llm_path_and_next_difficulty():
    llm = AsyncMock()
    llm.generate_json = AsyncMock(return_value={
        "technical_correctness": 9, "conceptual_understanding": 8, "answer_completeness": 8, "communication_clarity": 9,
        "feedback": "Solid.", "strengths": ["clear"], "gaps": [], "evidence": ["quote"], "ideal_answer_points": ["x"], "learning_topics": ["y"],
    })
    agent = EvaluationAgent(llm_service=llm, policy=DifficultyPolicy(enabled=True))
    ev = await agent.evaluate_answer("Explain GIL", "The GIL serialises bytecode execution...", difficulty="medium")
    assert ev["evaluation_source"] == "llm"
    assert ev["overall_score"] == pytest.approx(8.55)
    assert ev["next_difficulty"] == "hard"
    assert ev["policy_decision"]["direction"] == "increase"


@pytest.mark.asyncio
async def test_evaluation_agent_heuristic_when_llm_unavailable_is_flagged_and_conservative():
    llm = AsyncMock()
    llm.generate_json = AsyncMock(side_effect=LLMUnavailableError("no key"))
    agent = EvaluationAgent(llm_service=llm)
    long_fluent_answer = " ".join(["This is a fluent and confident sentence about databases and indexes."] * 20)
    ev = await agent.evaluate_answer("Explain B-tree indexes", long_fluent_answer, difficulty="medium")
    assert ev["evaluation_source"] == "heuristic"
    assert ev["technical_correctness"] <= 6.0           # fluency never buys correctness
    assert "could not be verified" in ev["feedback"]


@pytest.mark.asyncio
async def test_evaluation_agent_non_answer_scores_zero():
    agent = EvaluationAgent(llm_service=AsyncMock())
    ev = await agent.evaluate_answer("Q?", "I don't know", difficulty="hard")
    assert ev["overall_score"] == 0.0
    assert ev["evaluation_source"] == "unavailable"
    assert ev["next_difficulty"] == "medium"


def test_aggregate_round_mixed_sources():
    evals = [
        {"overall_score": 8, "evaluation_source": "llm", "difficulty": "medium", **{k: 8 for k in RUBRIC_KEYS}, "strengths": ["a"], "gaps": ["b"], "learning_topics": ["t"]},
        {"overall_score": 4, "evaluation_source": "heuristic", "difficulty": "hard", **{k: 4 for k in RUBRIC_KEYS}},
    ]
    agg = EvaluationAgent.aggregate_round(evals, "technical")
    assert agg["score"] == 60.0
    assert agg["evaluation_source"] == "mixed"
    assert agg["strengths"] == ["a"] and agg["weaknesses"] == ["b"]
    assert agg["difficulty_trace"] == ["medium", "hard"]
    assert EvaluationAgent.aggregate_round([], "hr")["score"] is None


# ── Question generator ────────────────────────────────────────────────────────

def test_category_inference_prioritises_resume_and_role():
    rs = {"skills": ["PyTorch", "FAISS", "LangGraph"], "projects": [{"name": "RAG bot", "description": "retrieval", "tech": ["FAISS"]}]}
    cats = infer_categories("ML Engineer", rs, "technical")
    assert cats[0] == "resume_projects"
    assert "machine_learning" in cats[:4]
    plan = plan_categories("ML Engineer", rs, "technical", 7)
    assert len(plan) == 7
    assert plan_categories("x", {}, "hr", 3) == ["hr_behavioral"] * 3


def test_similarity_dedupe():
    assert is_similar("What is a Python tuple?", "what is a python tuple")
    assert not is_similar("What is a Python tuple?", "Explain database sharding trade-offs")


@pytest.mark.asyncio
async def test_question_generator_llm_with_rag_sources_and_dedupe():
    llm = AsyncMock()
    llm.generate_json = AsyncMock(side_effect=[
        {"question": "Explain FAISS flat indexes", "is_follow_up": False, "rationale": "r", "grounded_in": ["projects#0"]},
        {"question": "How did you chunk resumes for your RAG bot?", "is_follow_up": True, "rationale": "r2", "grounded_in": ["projects#0"]},
    ])

    class FakeChunk:
        def __init__(self):
            self.chunk_id, self.section, self.chunk_index, self.score, self.text = "c:projects:0", "projects", 0, 0.42, "[PROJECTS]\nRAG bot with FAISS"
        def source_ref(self):
            return {"chunk_id": self.chunk_id, "section": self.section, "chunk_index": 0, "score": self.score, "preview": "RAG bot"}

    class FakeRAG:
        async def retrieve(self, cid, q, k=None, sections=None):
            return [FakeChunk()]
        @staticmethod
        def build_context_block(chunks, max_chars=2400):
            return "[source: projects#0]\nRAG bot with FAISS"
        @staticmethod
        def sources(chunks):
            return [c.source_ref() for c in chunks]

    gen = QuestionGenerator(llm_service=llm, rag_service=FakeRAG())
    out = await gen.generate(round_name="technical", target_role="ML Engineer", candidate_id="cand",
                             resume_structured={"projects": [{"name": "RAG bot"}]}, difficulty="medium", category="rag",
                             question_number=2, total_questions=5,
                             asked_questions=["Explain FAISS flat indexes"])  # first LLM output is a duplicate
    assert out["question"].startswith("How did you chunk")
    assert out["generation_source"] == "llm"
    assert out["retrieval_sources"][0]["section"] == "projects"
    assert llm.generate_json.await_count == 2


@pytest.mark.asyncio
async def test_question_generator_bank_fallback_personalised():
    llm = AsyncMock()
    llm.generate_json = AsyncMock(side_effect=LLMUnavailableError("none"))
    gen = QuestionGenerator(llm_service=llm, rag_service=None)
    out = await gen.generate(round_name="technical", target_role="Backend", candidate_id=None,
                             resume_structured={"projects": [{"name": "PayFlow"}]}, difficulty="hard", category="resume_projects",
                             question_number=1, total_questions=3, asked_questions=[])
    assert out["generation_source"] == "bank"
    assert "PayFlow" in out["question"]
    assert out["difficulty"] == "hard"


# ── LangGraph interview graph ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_interview_graph_routes_and_adapts():
    llm = AsyncMock()
    llm.available = False
    llm.generate_json = AsyncMock(side_effect=LLMUnavailableError("none"))
    gen = QuestionGenerator(llm_service=llm, rag_service=None)
    strong = {"technical_correctness": 9, "conceptual_understanding": 9, "answer_completeness": 9, "communication_clarity": 9,
              "feedback": "great", "strengths": [], "gaps": [], "evidence": [], "ideal_answer_points": [], "learning_topics": []}
    eval_llm = AsyncMock()
    eval_llm.generate_json = AsyncMock(return_value=strong)
    evaluator = EvaluationAgent(llm_service=eval_llm)
    graph = InterviewGraph(gen, evaluator, llm_service=llm)

    state = {"session_id": "s", "candidate_id": None, "target_role": "ML Engineer", "resume_structured": {},
             "config": {"rounds": ["technical", "hr"], "questions_per_round": 2, "difficulty": "medium", "adaptive": True},
             "rounds_queue": ["hr"], "current_round": "technical", "status": "active", "current_difficulty": "medium",
             "questions": [], "conversation_history": [], "asked_questions_all": [], "round_scores": {}, "round_results": {},
             "persona": {"name": "P", "description": "d"}, "turn_counter": 0}

    s1 = await graph.run(state, "open")
    assert s1["next_question"]["index"] == 0 and s1["next_question"]["difficulty"] == "medium"
    assert s1["conversation_history"][0]["speaker"] == "interviewer"

    s2 = await graph.run(s1, "answer", "A strong answer about overfitting and regularisation.")
    assert s2["last_evaluation"]["overall_score"] == 9.0
    assert s2["current_difficulty"] == "hard"                  # increased by the policy
    assert s2["next_question"]["index"] == 1 and s2["next_question"]["difficulty"] == "hard"
    assert not s2["round_should_end"]

    s3 = await graph.run(s2, "answer", "Another strong answer.")
    assert s3["round_should_end"] is True and s3["next_question"] is None   # limit of 2 reached

    s4 = await graph.run(s3, "finalize")
    assert s4["round_scores"]["technical"] == 90.0
    assert s4["current_round"] == "hr" and s4["rounds_queue"] == []
    assert s4["current_difficulty"] == "medium"                 # reset for the new round
    assert s4["questions"] == []

    desc = graph.describe()
    assert {"technical_agent", "hr_agent", "dsa_agent", "evaluate_answer", "adapt_difficulty"} <= set(desc["nodes"])
