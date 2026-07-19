import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json
from agents.dsa_agent import DSAInterviewAgent
from agents.tech_agent import TechInterviewAgent
from agents.hr_agent import HRInterviewAgent

@pytest.mark.asyncio
async def test_dsa_agent_get_problem():
    mock_llm_service = AsyncMock()
    mock_llm_service.generate_json = AsyncMock(side_effect=[
        # first call: extract candidate profile
        {"summary": "Experienced with DP", "projects": [], "skills": []},
        # second call: get_problem
        {
          "title": "Unique Dynamic Programming Problem",
          "description": "Solve this DP problem",
          "examples": [],
          "constraints": [],
          "starter_code": {"python": "def solve(): pass"},
          "difficulty": "medium",
          "pattern": "Dynamic Programming"
        }
    ])
    
    agent = DSAInterviewAgent(llm_service=mock_llm_service)
    
    # Test problem generation
    problem = await agent.get_problem(
        target_role="Software Engineer",
        difficulty="medium",
        resume_text="Experienced with DP",
        session_id="session-123"
    )
    
    assert problem["title"] == "Unique Dynamic Programming Problem"
    assert problem["pattern"] == "Dynamic Programming"
    assert "session-123" in agent._session_patterns
    assert "Dynamic Programming" in agent._session_patterns["session-123"]


@pytest.mark.asyncio
async def test_tech_agent_opening_question():
    mock_llm_service = AsyncMock()
    mock_llm_service.generate_json = AsyncMock(side_effect=[
        # first call: extract candidate profile
        {
            "summary": "Experienced Python Backend Engineer",
            "projects": ["Project A"],
            "skills": ["Python", "Django"]
        },
        # second call: get_opening_question
        {
            "question": "How do you optimize a Django ORM query?",
            "concept": "ORM Optimization"
        }
    ])
    
    agent = TechInterviewAgent(llm_service=mock_llm_service)
    
    # Test get_opening_question
    question = await agent.get_opening_question(
        target_role="Backend Engineer",
        resume_text="Python Django Engineer",
        session_id="session-456",
        persona={"name": "Strict", "description": "Aggressive engineer"}
    )
    
    assert question == "How do you optimize a Django ORM query?"
    assert "session-456" in agent._session_memory
    assert "ORM Optimization" in agent._session_memory["session-456"]["concepts_covered"]



@pytest.mark.asyncio
async def test_hr_agent_opening_question():
    mock_llm_service = AsyncMock()
    mock_llm_service.generate = AsyncMock(return_value="Tell me about a time you resolved a conflict on your team.")

    agent = HRInterviewAgent(llm_service=mock_llm_service)

    # Test get_opening_question with session_id
    question = await agent.get_opening_question(
        target_role="Product Manager",
        session_id="session-hr-123"
    )

    assert question == "Tell me about a time you resolved a conflict on your team."
    assert "session-hr-123" in agent._session_memory
    assert agent._session_memory["session-hr-123"]["evaluations"] == []

