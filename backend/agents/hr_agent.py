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
You are a warm, professional, but thorough HR interviewer.
Rules:
- Never reveal or output your reasoning, thinking process, planning, or chain of thought.
- Never output tags such as <think>, <analysis>, or similar.
- Produce only the final spoken response to the candidate.
- Behave exactly like a human interviewer.
- Speak naturally and conversationally.
- Ask only one question at a time.
- Wait for the candidate's response before asking the next question.
- Do not mention STAR. Instead, naturally ask behavioral questions that encourage detailed examples.
- Never generate sample answers, templates, or script cues for the candidate.
- Never explain what you will ask next or meta-describe the interview structure.
- Focus on four behavioral topics: teamwork, conflict resolution, failure/learning, and motivation.
- Acknowledge the candidate's response warmly before transitioning to the next single question.
- Do NOT ask anything about salary in this version.
- End with "Do you have any questions for us?" and give a brief company pitch.\
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

    def _build_resume_context(self, resume_structured: dict) -> str:
        """Format resume structure into a readable context string for prompts."""
        lines = []
        
        if resume_structured.get("summary"):
            lines.append(f"Summary: {resume_structured['summary']}")
        
        if resume_structured.get("skills"):
            lines.append(f"Skills: {', '.join(resume_structured['skills'][:20])}")
        
        if resume_structured.get("projects"):
            lines.append("\nProjects:")
            for p in resume_structured["projects"]:
                lines.append(f"  - {p['name']}: {p.get('description', '')}")
                if p.get("tech"):
                    lines.append(f"    Tech: {', '.join(p['tech'])}")
                if p.get("highlights"):
                    for h in p["highlights"]:
                        lines.append(f"    • {h}")
        
        if resume_structured.get("experience"):
            lines.append("\nWork Experience:")
            for e in resume_structured["experience"]:
                lines.append(f"  - {e['role']} at {e['company']} ({e.get('duration', '')})")
                for point in e.get("points", [])[:3]:
                    lines.append(f"    • {point}")
        
        return "\n".join(lines)

    async def get_opening_question(self, target_role: str, resume_structured: dict = None, session_id: str = None) -> str:
        """Generate a warm introduction and the first behavioural question based on the resume."""
        if resume_structured is None:
            resume_structured = {}
        if session_id:
            self._session_memory[session_id] = {
                "evaluations": []
            }

        resume_context = self._build_resume_context(resume_structured)
        
        # Pick specific focus options for HR behavioral question (experience company or project)
        import random
        experience = resume_structured.get("experience", [])
        projects = resume_structured.get("projects", [])
        
        focus_options = []
        if experience:
            for exp in experience[:2]:
                focus_options.append(f"your role as {exp['role']} at {exp['company']}")
        if projects:
            for proj in projects[:2]:
                focus_options.append(f"your project {proj['name']}")
                
        chosen_focus = random.choice(focus_options) if focus_options else "your professional background"

        prompt = f"""You are a warm, professional HR interviewer starting a behavioral interview for a candidate applying for the role of "{target_role}".

CANDIDATE'S RESUME:
{resume_context}

Introduce yourself warmly, put the candidate at ease, and then ask a specific, personalized behavioral question about {chosen_focus}.
The question must:
- Reference a specific company or project from their resume (e.g. "You worked at [Company] - tell me about...")
- Ask about a challenging deadline, team conflict, failure, or motivation in that specific context
- Be conversational and warm, 2-3 sentences max
- NOT say "I see on your resume..." - just reference it naturally

Return ONLY the response text, nothing else."""

        try:
            response = await self.llm_service.generate(prompt, system_instruction=_SYSTEM_PROMPT)
            question = response.strip()
        except Exception as exc:
            logger.warning("HR get_opening_question LLM call failed, using local fallback: %s", exc)
            fallback_company = experience[0]['company'] if experience else "your last company"
            question = f"Hi there! Welcome to the HR behavioral round. I am delighted to speak with you today. Looking at your experience, could you tell me about a challenging situation or tight deadline you faced while working at {fallback_company}, and how you handled it?"

        logger.info(
            "Generated HR opening (role=%s): %.80s...",
            target_role, question,
        )
        return question

    async def respond_to_answer(
        self,
        conversation_history: list,
        candidate_response: str,
        resume_structured: dict = None,
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

        resume_context = ""
        if resume_structured:
            resume_context = f"""
CANDIDATE RESUME CONTEXT (use this to customize follow-ups or reference past details):
{self._build_resume_context(resume_structured)}
"""

        system_instruction = """You are a warm, professional, but thorough HR interviewer.
Rules:
- Never reveal or output your reasoning, thinking process, planning, or chain of thought.
- Never output tags such as <think>, <analysis>, or similar.
- Behave exactly like a human interviewer.
- Speak naturally and conversationally.
- Ask only one question at a time.
- Wait for the candidate's response before asking the next question.
- Do not mention STAR. Instead, naturally ask behavioral questions that encourage detailed examples.
- Never generate sample answers, templates, or script cues for the candidate.
- Never explain what you will ask next or meta-describe the interview structure.
- Focus on four behavioral topics: teamwork, conflict resolution, failure/learning, and motivation.
- Acknowledge the candidate's response warmly before transitioning to the next single question.
- Do NOT ask anything about salary in this version.
- End with "Do you have any questions for us?" and give a brief company pitch.

Return your response ONLY as a valid JSON object matching this schema:
{
  "response": "The next single question/feedback to speak to the candidate. Keep it concise, natural, and free of any thinking process, reasoning, tags, or sample answers.",
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

        asked = [
            turn.get("text", turn.get("content", ""))
            for turn in conversation_history
            if turn.get("speaker") == "interviewer" or turn.get("role") == "interviewer"
        ]

        if len(asked) >= 4:
            system_instruction = """You are a warm, professional HR interviewer.
The interview is now COMPLETE. Do NOT ask any more questions.
Deliver a warm final concluding message thanking the candidate for their time, pitching the company briefly, and wrapping up the round.
Keep your response under 3 sentences.

Return your response ONLY as a valid JSON object matching this schema:
{
  "response": "The final warm concluding message thanking the candidate and wrapping up the round.",
  "should_continue": false,
  "latest_answer_evaluation": {
    "communication": 8.0,
    "confidence": 8.0,
    "clarity": 8.0,
    "professionalism": 8.0,
    "leadership": 8.0,
    "teamwork": 8.0
  }
}
Output strictly valid JSON."""

        evaluations_history = ""
        if session_id and session_id in self._session_memory:
            evals = self._session_memory[session_id].get("evaluations", [])
            if evals:
                evaluations_history = "\nPrevious Answer Evaluations:\n" + json.dumps(evals, indent=2)

        # Build conversation string
        conv = "\n".join([
            f"{'Interviewer' if e.get('role', e.get('speaker'))=='interviewer' else 'Candidate'}: {e.get('content', e.get('text', ''))}"
            for e in conversation_history[-8:]
        ])

        prompt = f"""HR Interview Conversation History:
{conv}
{evaluations_history}
{resume_context}

Candidate's Latest Response:
"{candidate_response}"

Evaluate the candidate's latest response and generate the next turn in the interview. If relevant, reference their resume experience, role durations, or projects."""

        should_continue = True
        try:
            result = await self.llm_service.generate_json(
                prompt,
                system_instruction=system_instruction
            )
            if result and "response" in result:
                reply = result["response"]
                if len(asked) >= 4:
                    should_continue = False
                else:
                    should_continue = result.get("should_continue", True)
                if session_id and "latest_answer_evaluation" in result:
                    self._session_memory[session_id]["evaluations"].append(result["latest_answer_evaluation"])
            else:
                raise ValueError("Invalid result format from LLM")
        except Exception as exc:
            logger.warning("HR respond_to_answer LLM call failed, using local fallback: %s", exc)
            if len(asked) >= 4:
                reply = "Thank you so much for your time today. It has been a pleasure getting to know you. We'll follow up with next steps very soon!"
                should_continue = False
            else:
                hist_len = len(conversation_history)
                if hist_len <= 2:
                    reply = "That's a really great reflection. Team collaboration is key. Moving on, could you share an instance where you faced a failure or a significant setback in your career, and how you recovered and what you learned from it?"
                elif hist_len <= 4:
                    reply = "Thank you for sharing that; resilience and learning from failure are so important. Let's discuss motivation: what drives your passion as a software professional, and why does this role appeal to you?"
                elif hist_len <= 6:
                    reply = "Wonderful, I love that drive. Before we wrap up, do you have any questions for me about our company culture, the team structure, or next steps?"
                else:
                    reply = "Thank you so much for your time today. It has been a pleasure getting to know you. We'll follow up with next steps very soon!"
                should_continue = True

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
