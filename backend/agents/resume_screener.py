"""Resume screening agent powered by Groq/LLM Service."""

import json
import logging

from core.config import settings
from services.llm_service import llm_service as global_llm_service

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert ATS (Applicant Tracking System) resume screener.

Analyse the candidate's resume against the target role and return your evaluation
as a single, valid JSON object matching the required schema.

Required JSON schema:
{
  "ats_score": <float 0-100>,
  "matched_skills": ["skill1", "skill2", ...],
  "missing_skills": ["skill1", "skill2", ...],
  "experience_level": "fresher" | "junior" | "mid" | "senior",
  "decision": "pass" | "fail",
  "reasoning": "<2-3 line summary>",
  "suggested_rounds": ["dsa", "technical", "hr"]
}

Rules:
- ats_score: 0-100 based on skill match %, experience relevance, and overall fit.
- matched_skills / missing_skills: concrete, specific skills (not vague categories).
- experience_level: infer from years of experience and project complexity.
- decision: "pass" if ats_score >= 60, otherwise "fail".
- suggested_rounds: customise based on the role — for example a frontend role may
  skip "dsa" in favour of a "system_design" or "ui_ux" round.  Always include "hr".
- Return ONLY the JSON object. No extra text before or after.\
"""


class ResumeScreenerAgent:
    """Screens resumes against a target role using Groq/LLM Service."""

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service

    async def screen(self, resume_text: str, target_role: str) -> dict:
        """Screen a resume against a target role.

        Sends the resume text and target role to LLM Service, expecting a
        structured JSON evaluation back.

        Args:
            resume_text: Full extracted text of the candidate's resume.
            target_role: The job role the candidate is applying for.

        Returns:
            A dict matching the ATS evaluation schema.
        """
        user_message = (
            f"TARGET ROLE: {target_role}\n\n"
            f"RESUME TEXT:\n{resume_text}"
        )

        logger.info("Screening resume for role '%s'", target_role)
        try:
            result = await self.llm_service.generate_json(
                user_message,
                system_instruction=_SYSTEM_PROMPT
            )
            if result is not None:
                logger.info("ATS score: %.1f | decision: %s", result["ats_score"], result["decision"])
                return result
        except Exception as exc:
            logger.error("LLM failed to screen resume: %s", exc)
            raise ValueError(f"Failed to obtain valid JSON from LLM: {exc}")

        raise ValueError("Failed to parse LLM response as JSON.")
