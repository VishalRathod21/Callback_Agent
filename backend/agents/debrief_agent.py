import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class DebriefAgent:
    """
    Post-interview debrief chat agent.
    Has full context of the interview: transcript, scores, resume.
    Answers candidate questions about their performance in detail.
    """

    BASE_SYSTEM = """You are an expert interview coach conducting a post-interview debrief.
You have complete access to this candidate's interview transcript, their scores, 
and their resume. Your job is to:
- Answer specific questions about their performance honestly but constructively
- Explain WHY they got the score they did with specific examples from their transcript
- Show them EXACTLY what a better answer would have looked like
- Give actionable, specific advice — not generic tips
- Be encouraging but honest — don't sugarcoat weaknesses

You have access to their full interview data. Use it specifically in your responses.
When they ask about a question, quote their actual answer and show the gap."""

    def __init__(self, model=None, llm_service=None):
        from services.llm_service import llm_service as global_llm_service
        self.llm_service = llm_service or global_llm_service

    def _build_context(
        self,
        transcripts: list[dict],
        scores: dict,
        resume_structured: dict,
        evaluation_data: dict
    ) -> str:
        """Build comprehensive context string for the debrief."""
        
        ctx_parts = []
        
        # Resume summary
        if resume_structured:
            skills = resume_structured.get("skills", [])[:10]
            projects = [p["name"] for p in resume_structured.get("projects", [])]
            ctx_parts.append(
                f"CANDIDATE PROFILE:\n"
                f"Skills: {', '.join(skills)}\n"
                f"Projects: {', '.join(projects)}"
            )
        
        # Scores
        if scores:
            score_lines = [f"  {k}: {v}/100" for k, v in scores.items()]
            ctx_parts.append(f"ROUND SCORES:\n" + "\n".join(score_lines))
        
        # Full transcripts per round
        for transcript in transcripts:
            round_name = transcript.get("round_name", "Unknown Round")
            content = transcript.get("transcript", "")
            score = transcript.get("score", 0)
            evaluation = transcript.get("ai_evaluation", {})
            
            ctx_parts.append(
                f"{'='*40}\n"
                f"ROUND: {round_name.upper()} (Score: {score}/100)\n"
                f"FEEDBACK: {evaluation.get('feedback', 'No feedback available')}\n"
                f"TRANSCRIPT:\n{content}\n"
                f"{'='*40}"
            )
        
        # Overall evaluation
        if evaluation_data:
            ctx_parts.append(
                f"OVERALL ASSESSMENT:\n"
                f"Strengths: {', '.join(evaluation_data.get('strengths', []))}\n"
                f"Improvements: {', '.join(evaluation_data.get('improvements', []))}"
            )
        
        return "\n\n".join(ctx_parts)

    async def chat(
        self,
        user_message: str,
        conversation_history: list[dict],
        context: str
    ) -> str:
        """
        Generate a debrief response.
        conversation_history: list of {"role": "user"/"assistant", "content": str}
        """
        
        # Build conversation for Gemini
        conv_text = "\n".join([
            f"{'Candidate' if m['role']=='user' else 'Coach'}: {m['content']}"
            for m in conversation_history[-10:]  # last 10 turns
        ])
        
        prompt = f"""{self.BASE_SYSTEM}

INTERVIEW DATA (your complete context):
{context}

CONVERSATION SO FAR:
{conv_text}

Candidate asks: "{user_message}"

Respond as the interview coach. Be specific — quote their actual answers from the
transcript when relevant. Show exactly what they should have said differently.
Keep response focused and under 300 words unless showing a detailed example answer."""

        response_text = await self.llm_service.generate(prompt, temperature=0.7)
        return response_text.strip()

    def get_starter_questions(self, scores: dict) -> list[str]:
        """Generate suggested starter questions based on lowest scoring areas."""
        questions = []
        
        if scores:
            sorted_scores = sorted(scores.items(), key=lambda x: x[1])
            weakest_round = sorted_scores[0][0] if sorted_scores else None
            
            if weakest_round:
                questions.append(f"Why did I score low in the {weakest_round} round?")
                questions.append(f"What should I have said differently in {weakest_round}?")
        
        questions.extend([
            "What was my strongest moment in the interview?",
            "Show me a model answer for my weakest response",
            "What should I study before my next interview?",
            "How close am I to being ready for a real interview?"
        ])
        
        return questions[:5]
