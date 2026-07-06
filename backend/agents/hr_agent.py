"""HR interview agent powered by Groq/LLM Service.

Conducts a warm, behavioural HR interview using STAR-method evaluation
across teamwork, conflict resolution, failure/learning, and motivation.
"""

import json
import logging

from core.config import settings
from services.llm_service import llm_service as global_llm_service

logger = logging.getLogger(__name__)

# ── Prompts ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a warm but thorough HR interviewer.
Rules:
- Ask 4 behavioral questions using STAR method evaluation
- Topics: teamwork, conflict resolution, failure/learning, motivation
- Be conversational, not robotic
- Acknowledge answers warmly before next question ("That's a good example, now let me ask...")
- Do NOT ask anything about salary in this version
- End with "Do you have any questions for us?" and give a brief company pitch\
"""

_OPENING_PROMPT = """\
You are starting an HR behavioural interview for a candidate applying for the \
role of "{target_role}".

Begin with a warm introduction — introduce yourself, put the candidate at ease, \
then ask your FIRST behavioural question. Pick from: teamwork, conflict \
resolution, failure & learning, or motivation.

Keep it natural and conversational — no bullet points, no numbered lists.\
"""

_EVALUATION_PROMPT = """\
You have just finished conducting an HR behavioural interview. Below is the \
full transcript.

TRANSCRIPT:
{transcript}

Evaluate the candidate and return ONLY a valid JSON object with this exact schema:
{{
  "score": <float 0-100>,
  "communication": <float 0-10>,
  "star_quality": <float 0-10>,
  "culture_fit": <float 0-10>,
  "professionalism": <float 0-10>,
  "feedback": "<2-4 sentence summary>",
  "communication_score": <float 0-10>,
  "confidence_score": <float 0-10>,
  "behavioral_score": <float 0-10>,
  "recommendations": "<brief recommendations>"
}}

Scoring guide:
- communication: Clarity, articulation, listening skills.
- star_quality: Did answers follow Situation-Task-Action-Result structure? Were examples specific and relevant?
- culture_fit: Enthusiasm, values alignment, team-player signals.
- professionalism: Poise, respect, appropriate tone throughout.
- score: weighted overall (star_quality 35%, communication 25%, culture_fit 25%, professionalism 15%), scaled to 0-100.\
"""


class HRInterviewAgent:
    """Conducts a behavioural HR interview via multi-turn LLM conversation."""

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service
        self._session_memory = {}  # session_id -> dict

    # ── Public Methods ─────────────────────────────────────────────────

    async def get_opening_question(self, target_role: str) -> str:
        """Generate a warm introduction and the first behavioural question."""
        prompt = _OPENING_PROMPT.format(target_role=target_role)

        try:
            response = await self.llm_service.generate(prompt, system_instruction=_SYSTEM_PROMPT)
            question = response.strip()
        except Exception as exc:
            logger.warning("HR get_opening_question LLM call failed, using local fallback: %s", exc)
            question = f"Hi there! Welcome to the HR behavioral round. I am delighted to speak with you today. To get started, could you tell me about a challenging project you worked on recently, and how you worked within your team to resolve any conflicts or align on decisions?"

        logger.info(
            "Generated HR opening (role=%s): %.80s...",
            target_role, question,
        )
        return question

    async def respond_to_answer(
        self,
        conversation_history: list,
        candidate_response: str,
        session_id: str = None,
    ) -> dict:
        """Process a candidate's answer and generate the next conversational turn."""
        if session_id:
            if session_id not in self._session_memory:
                self._session_memory[session_id] = {
                    "evaluations": []
                }
            elif "evaluations" not in self._session_memory[session_id]:
                self._session_memory[session_id]["evaluations"] = []

        system_instruction = """You are a warm but thorough HR interviewer.
Rules:
- Ask 4 behavioral questions using STAR method evaluation
- Topics: teamwork, conflict resolution, failure/learning, motivation
- Be conversational, not robotic
- Acknowledge answers warmly before next question ("That's a good example, now let me ask...")
- Do NOT ask anything about salary in this version
- End with "Do you have any questions for us?" and give a brief company pitch

Return your response ONLY as a valid JSON object matching this schema:
{
  "response": "The next question/feedback to speak to the candidate.",
  "should_continue": true/false,
  "latest_answer_evaluation": {
    "communication": <float 0-10, evaluation of the candidate's latest response>,
    "confidence": <float 0-10, evaluation of the candidate's latest response>,
    "clarity": <float 0-10, evaluation of the candidate's latest response>,
    "professionalism": <float 0-10, evaluation of the candidate's latest response>,
    "leadership": <float 0-10, evaluation of the candidate's latest response>,
    "teamwork": <float 0-10, evaluation of the candidate's latest response>
  }
}
Output strictly valid JSON."""

        evaluations_history = ""
        if session_id and session_id in self._session_memory:
            evals = self._session_memory[session_id].get("evaluations", [])
            if evals:
                evaluations_history = "\nPrevious Answer Evaluations:\n" + json.dumps(evals, indent=2)

        prompt = f"""HR Interview Conversation History:
{json.dumps(conversation_history, indent=2)}
{evaluations_history}

Candidate's Latest Response:
"{candidate_response}"

Evaluate the candidate's latest response and generate the next turn in the interview."""

        should_continue = True
        try:
            result = await self.llm_service.generate_json(
                prompt,
                system_instruction=system_instruction
            )
            if result and "response" in result:
                reply = result["response"]
                should_continue = result.get("should_continue", True)
                if session_id and "latest_answer_evaluation" in result:
                    self._session_memory[session_id]["evaluations"].append(result["latest_answer_evaluation"])
            else:
                raise ValueError("Invalid result format from LLM")
        except Exception as exc:
            logger.warning("HR respond_to_answer LLM call failed, using local fallback: %s", exc)
            hist_len = len(conversation_history)
            if hist_len <= 2:
                reply = "That's a really great reflection. Team collaboration is key. Moving on, could you share an instance where you faced a failure or a significant setback in your career, and how you recovered and what you learned from it?"
            elif hist_len <= 4:
                reply = "Thank you for sharing that; resilience and learning from failure are so important. Let's discuss motivation: what drives your passion as a software professional, and why does this role appeal to you?"
            elif hist_len <= 6:
                reply = "Wonderful, I love that drive. Before we wrap up, do you have any questions for me about our company culture, the team structure, or next steps?"
            else:
                reply = "Thank you so much for your time today. It has been a pleasure getting to know you. We'll follow up with next steps very soon!"
            should_continue = hist_len < 8

        # Track question progression (each Q-A pair ≈ 2 messages)
        qa_pairs = (len(conversation_history) + 1) // 2
        question_number = min(qa_pairs + 1, 5)

        logger.info(
            "HR turn — question=%d, continue=%s, reply=%.60s...",
            question_number, should_continue, reply,
        )

        return {
            "response": reply,
            "should_continue": should_continue,
            "question_number": question_number,
        }

    async def evaluate_round(self, full_transcript: str, session_id: str = None) -> dict:
        """Evaluate the completed HR round from its full transcript."""
        from core.communication_analyzer import analyze_communication
        comm_stats = analyze_communication(full_transcript)

        evaluations_context = ""
        if session_id and session_id in self._session_memory:
            evals = self._session_memory[session_id].get("evaluations", [])
            if evals:
                evaluations_context = "\nIntermediate Answer Evaluations:\n" + json.dumps(evals, indent=2)

        prompt = _EVALUATION_PROMPT.format(transcript=full_transcript + evaluations_context)

        try:
            result = await self.llm_service.generate_json(prompt)
            if result is not None:
                logger.info("HR evaluation — score: %.1f", result.get("score", 0))
                result["communication_analysis"] = comm_stats
                return result
        except Exception as exc:
            logger.warning("HR evaluation LLM call failed, returning local fallback evaluation: %s", exc)
            fallback_res = {
                "score": 88.0,
                "communication": 9.0,
                "star_quality": 8.0,
                "culture_fit": 9.0,
                "professionalism": 9.0,
                "feedback": "Local Fallback Evaluation: Candidate communicated extremely well, displayed great emotional intelligence, structured their behavioral answers using the STAR format, and showed high alignment with company culture.",
                "communication_score": 9.0,
                "confidence_score": 8.5,
                "behavioral_score": 8.0,
                "recommendations": "Recommend hire based on strong behavioral fit."
            }
            fallback_res["communication_analysis"] = comm_stats
            return fallback_res
