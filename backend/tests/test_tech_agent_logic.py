import pytest
from unittest.mock import AsyncMock, MagicMock
from agents.tech_agent import TechInterviewAgent

@pytest.mark.asyncio
async def test_normalization_and_similarity():
    agent = TechInterviewAgent()
    
    q1 = "How would you optimize this system's data ingestion layer to handle 10x the current load?"
    q2 = "how would you optimize this systems data ingestion layer to handle 10x the current load."
    q3 = "Design a dynamic rate limiter for caching."

    # exact/similar normalized match
    assert agent._normalize_string(q1) == agent._normalize_string(q2)
    assert agent._calculate_similarity(q1, q2) == 1.0

    # duplicate check is True
    is_dup, score, _ = agent._is_duplicate_or_similar(q2, [q1])
    assert is_dup is True
    assert score == 1.0

    # completely different check is False
    is_dup_diff, score_diff, _ = agent._is_duplicate_or_similar(q3, [q1])
    assert is_dup_diff is False
    assert score_diff < 0.5


@pytest.mark.asyncio
async def test_retry_on_duplicate_question():
    mock_llm_service = AsyncMock()
    mock_llm_service.generate_json = AsyncMock(side_effect=[
        # First call: extract profile
        {
            "summary": "Full Stack Engineer",
            "projects": [],
            "skills": []
        },
        # Second call: respond_to_answer first attempt (duplicate)
        {
            "response": "How would you optimize this system's data ingestion layer to handle 10x the current load?",
            "concept": "Data Ingestion Scaling",
            "is_follow_up": True,
            "should_continue": True
        },
        # Third call: respond_to_answer second attempt (unique)
        {
            "response": "What are your choices for choosing partition keys in database scaling?",
            "concept": "Partition Keys",
            "is_follow_up": True,
            "should_continue": True,
            "latest_answer_evaluation": {
                "correctness": 8.0,
                "depth": 8.0,
                "communication": 9.0,
                "practical_knowledge": 8.0,
                "reasoning": 8.0,
                "feedback": "Strong answer on scalability."
            }
        }
    ])

    agent = TechInterviewAgent(llm_service=mock_llm_service)
    
    session_id = "test-session-duplicate-retry"
    agent._session_memory[session_id] = {
        "concepts_covered": ["Data Ingestion Scaling"],
        "questions_asked": ["How would you optimize this system's data ingestion layer to handle 10x the current load?"],
        "follow_ups": [],
        "profile": {
            "summary": "Full Stack Engineer",
            "projects": [],
            "skills": []
        },
        "question_count": 1,
        "evaluations": []
    }

    result = await agent.respond_to_answer(
        conversation_history=[],
        candidate_response="I would use kafka partitioning.",
        resume_text="",
        session_id=session_id
    )

    # Verify that the agent skipped the duplicate first try and returned the second try question
    assert result["response"] == "What are your choices for choosing partition keys in database scaling?"
    assert result["should_continue"] is True
    
    # Check session memory updates
    assert "Partition Keys" in agent._session_memory[session_id]["concepts_covered"]
    assert "What are your choices for choosing partition keys in database scaling?" in agent._session_memory[session_id]["questions_asked"]
    assert len(agent._session_memory[session_id]["questions_asked"]) == 2


@pytest.mark.asyncio
async def test_dynamic_difficulty_and_fallback():
    # If the LLM generates only duplicates or fails, verify fallback selection based on difficulty tier
    mock_llm_service = AsyncMock()
    # Mock LLM calls to fail so it immediately triggers the fallback selection
    mock_llm_service.generate_json.side_effect = Exception("LLM connection timeout")

    agent = TechInterviewAgent(llm_service=mock_llm_service)
    
    session_id = "test-session-fallback-tier"
    agent._session_memory[session_id] = {
        "concepts_covered": ["Database Lock types"],
        "questions_asked": ["Could you explain the difference between optimistic and pessimistic locking, and in what scenarios you would choose one over the other?"],
        "follow_ups": [],
        "profile": {
            "summary": "Full Stack Engineer",
            "projects": [],
            "skills": []
        },
        "question_count": 1,
        "evaluations": []
    }

    # At question count 1 (next_count = 2), difficulty tier is Fundamentals (Q1-2)
    # The first fallback in Fundamentals is "Let's discuss database indexes..." (which hasn't been asked yet)
    result = await agent.respond_to_answer(
        conversation_history=[],
        candidate_response="Optimistic locks use versioning, pessimistic locks lock rows.",
        resume_text="",
        session_id=session_id
    )

    assert "garbage collection" in result["response"].lower()
    assert result["response"] == "Can you explain how garbage collection works in your language of choice (e.g., Python's reference counting/generational collection vs. Go's concurrent mark-and-sweep or Java's G1GC), and how it impacts application latency?"
    assert result["should_continue"] is True
