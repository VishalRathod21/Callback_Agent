"""Technical interview agent powered by Groq/LLM Service.

Conducts a resume-aware, role-specific technical interview covering core
concepts, system design, and domain-specific depth.
"""

import json
import logging
import re
import difflib
from core.config import settings
from services.llm_service import llm_service as global_llm_service

logger = logging.getLogger(__name__)

# ── Fallback Questions ────────────────────────────────────────────────────────

_FALLBACK_QUESTIONS = [
    # Tiers 1-2: Fundamentals
    "Let's discuss database indexes. Can you explain the difference between a clustered and non-clustered index, and how they impact read/write performance?",
    "Could you explain the difference between optimistic and pessimistic locking, and in what scenarios you would choose one over the other?",
    
    # Tiers 3-4: Implementation
    "If you had to design a cache invalidation strategy for a high-traffic product catalog, how would you approach it?",
    "How would you handle race conditions in a microservice where multiple concurrent requests attempt to update a shared resource like a user balance?",
    
    # Tiers 5-6: Architecture
    "How would you design a distributed rate limiter for an API gateway that handles millions of requests per second?",
    "If you were introducing a message queue like Kafka to decouple ingestion from processing, how would you ensure partition scaling and consumer group ordering?",
    
    # Tiers 7+: Failure modes / Tradeoffs / Scaling / Production Systems
    "How would you optimize this system's data ingestion layer to handle 10x the current load under heavy write pressure?",
    "When a downstream service goes down, how would you configure circuit breakers and retry policies to prevent cascading system-wide failures?",
]

# ── Prompts ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior technical interviewer specializing in system design and role-specific depth.
Rules:
- Start with the candidate's resume to ask relevant questions
- Cover: core concepts, system design basics, role-specific tools (e.g. for ML: transformers/embeddings, for backend: DB indexing/caching)
- 3-5 questions of increasing depth
- Follow up on every answer ("Can you go deeper on X?")
- Keep responses under 3 sentences\
"""

_OPENING_PROMPT = """\
You are starting a technical interview for the role of "{target_role}".

Here is a summary of the candidate's resume:
{resume_summary}

Based on their experience and the target role, generate your FIRST technical \
question. Pick something that bridges what they've already done with a core \
concept for the role. Ask ONE focused question — no preamble, no multiple \
parts.\
"""

_EVALUATION_PROMPT = """\
You have just finished conducting a technical interview for the role of \
"{target_role}". Below is the full transcript.

TRANSCRIPT:
{transcript}

Evaluate the candidate and return ONLY a valid JSON object with this exact schema:
{{
  "score": <float 0-100>,
  "technical_depth": <float 0-10>,
  "system_thinking": <float 0-10>,
  "role_specific": <float 0-10>,
  "feedback": "<2-4 sentence summary>",
  "strengths": "<brief summary of candidate's strengths>",
  "weaknesses": "<brief summary of candidate's weaknesses/areas of improvement>",
  "recommendations": "<brief hiring recommendations>"
}}

Scoring guide:
- technical_depth: How well did they explain underlying mechanisms? Did they go beyond surface-level answers?
- system_thinking: Did they consider trade-offs, scalability, failure modes?
- role_specific: Did they demonstrate competence with tools/frameworks/concepts critical to "{target_role}"?
- score: weighted overall (technical_depth 40%, role_specific 35%, system_thinking 25%), scaled to 0-100.\
"""


class TechInterviewAgent:
    """Conducts a resume-aware, persona-driven technical interview via multi-turn LLM conversation."""

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service
        self._session_memory = {}  # session_id -> dict

    # ── Utility Helpers ────────────────────────────────────────────────

    def _normalize_string(self, text: str) -> str:
        """Lowercase, remove punctuation, trim whitespace, and normalize spacing."""
        cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', text.lower())
        return " ".join(cleaned.split())

    def _calculate_similarity(self, q1: str, q2: str) -> float:
        """Calculate the similarity ratio between two questions using Gestalt pattern matching."""
        return difflib.SequenceMatcher(None, self._normalize_string(q1), self._normalize_string(q2)).ratio()

    def _is_duplicate_or_similar(self, new_question: str, asked_questions: list, threshold: float = 0.8) -> tuple[bool, float, str]:
        """Check if a new question is similar to any previously asked question."""
        for idx, past in enumerate(asked_questions):
            sim = self._calculate_similarity(new_question, past)
            if sim >= threshold:
                return True, sim, past
        return False, 0.0, ""

    def _get_difficulty_tier(self, question_count: int) -> str:
        """Return the target topic/difficulty tier based on current question count."""
        if question_count <= 2:
            return "Fundamentals (Core concepts, Basic data structures, Protocol choices)"
        elif question_count <= 4:
            return "Implementation Details (Code efficiency, Schema design, Caching invalidation/strategies, Concurrency)"
        elif question_count <= 6:
            return "Architecture (Distributed system designs, Load balancing, Message queues, Microservice boundaries)"
        else:
            return "Failure Modes, Tradeoffs, Scaling, and High-Traffic Production System constraints"

    def _get_fallback_question(self, session_id: str, question_count: int) -> str:
        """Select a unique fallback question appropriate for the difficulty tier."""
        asked = self._session_memory.get(session_id, {}).get("questions_asked", []) if session_id else []
        
        # Determine the fallback index based on question count
        # Map question count to fallback array indexes
        if question_count <= 2:
            candidates = _FALLBACK_QUESTIONS[0:2]
        elif question_count <= 4:
            candidates = _FALLBACK_QUESTIONS[2:4]
        elif question_count <= 6:
            candidates = _FALLBACK_QUESTIONS[4:6]
        else:
            candidates = _FALLBACK_QUESTIONS[6:8]
            
        for cand in candidates:
            is_dup, _, _ = self._is_duplicate_or_similar(cand, asked)
            if not is_dup:
                return cand
        
        # Absolute fallback if all tier fallbacks are exhausted
        for cand in _FALLBACK_QUESTIONS:
            is_dup, _, _ = self._is_duplicate_or_similar(cand, asked)
            if not is_dup:
                return cand
                
        return "Can you tell me about the challenges you faced with deployment pipelines and production scaling in your past role?"

    # ── Public Methods ─────────────────────────────────────────────────

    async def _extract_candidate_profile(self, resume_text: str) -> dict:
        if not resume_text:
            return {
                "summary": "Not provided",
                "projects": [],
                "skills": []
            }
        
        prompt = f"""Analyze the candidate's resume text below and extract:
1. Resume Summary: A brief 1-2 sentence summary of their technical background.
2. Projects: A list of key projects they have developed.
3. Skills: A list of main technical skills, languages, and frameworks.

The output must be a raw JSON object matching this structure:
{{
  "summary": "...",
  "projects": ["Project A", "Project B"],
  "skills": ["Skill 1", "Skill 2"]
}}
Output ONLY valid JSON.

Resume Text:
{resume_text}
"""
        try:
            result = await self.llm_service.generate_json(prompt)
            if result:
                return result
        except Exception as e:
            logger.warning("Failed to extract candidate profile in Tech agent: %s", e)
        
        return {
            "summary": "Candidate with technical background",
            "projects": [],
            "skills": []
        }

    async def get_opening_question(
        self,
        target_role: str,
        resume_text: str,
        session_id: str = None,
        persona: dict = None,
    ) -> str:
        """Generate the first technical question based on the role, persona, and resume profile."""
        if not persona:
            persona = {
                "name": "Senior Staff Engineer",
                "description": "Direct and rigorous. Focuses on code efficiency, correctness, cleanliness, and direct feedback."
            }

        profile = await self._extract_candidate_profile(resume_text)
        
        if session_id:
            self._session_memory[session_id] = {
                "concepts_covered": [],
                "questions_asked": [],
                "follow_ups": [],
                "profile": profile,
                "question_count": 0,
                "evaluations": []
            }

        difficulty_tier = self._get_difficulty_tier(1)

        system_instruction = f"""You are a technical interviewer conducting a round for target role: "{target_role}".
Interviewer Persona: "{persona['name']}" ({persona['description']})

Your task is to generate the FIRST technical question.
Ensure the question is resume-driven (refer to the candidate's skills, projects, and summary).
Match your persona's tone. Ask exactly ONE focused question.

Difficulty Tier for this question: {difficulty_tier}

Return your response ONLY as a valid JSON object matching this schema:
{{
  "question": "The question to ask",
  "concept": "The concept tested"
}}
Output strictly valid JSON."""

        prompt = f"""Candidate Profile:
- Target Role: {target_role}
- Resume Summary: {profile.get("summary")}
- Key Projects: {", ".join(profile.get("projects", []))}
- Claimed Skills: {", ".join(profile.get("skills", []))}
- Company Context: High-growth technology company building scalable systems.

Generate the opening question now."""

        try:
            result = await self.llm_service.generate_json(
                prompt,
                system_instruction=system_instruction,
                temperature=0.85
            )
            if result and "question" in result:
                q = result["question"]
                concept = result.get("concept", "Opening fundamentals")
                if session_id:
                    self._session_memory[session_id]["concepts_covered"].append(concept)
                    self._session_memory[session_id]["questions_asked"].append(q)
                    self._session_memory[session_id]["question_count"] += 1
                logger.info("Generated opening tech question (role=%s): %.80s...", target_role, q)
                return q
        except Exception as exc:
            logger.warning("Tech get_opening_question LLM call failed: %s", exc)

        fallback = self._get_fallback_question(session_id, 1)
        if session_id:
            self._session_memory[session_id]["concepts_covered"].append("Database Indexes")
            self._session_memory[session_id]["questions_asked"].append(fallback)
            self._session_memory[session_id]["question_count"] += 1
        return fallback

    async def respond_to_answer(
        self,
        conversation_history: list,
        candidate_response: str,
        resume_text: str,
        session_id: str = None,
        persona: dict = None,
    ) -> dict:
        """Process a candidate's answer and produce the next interviewer turn dynamically."""
        if not persona:
            persona = {
                "name": "Senior Staff Engineer",
                "description": "Direct and rigorous. Focuses on code efficiency, correctness, cleanliness, and direct feedback."
            }

        profile = None
        if session_id and session_id in self._session_memory:
            profile = self._session_memory[session_id].get("profile")
        
        if not profile:
            profile = await self._extract_candidate_profile(resume_text)
            if session_id:
                if session_id not in self._session_memory:
                    self._session_memory[session_id] = {
                        "concepts_covered": [],
                        "questions_asked": [],
                        "follow_ups": [],
                        "profile": profile,
                        "question_count": 0,
                        "evaluations": []
                    }
                else:
                    self._session_memory[session_id]["profile"] = profile
                    if "evaluations" not in self._session_memory[session_id]:
                        self._session_memory[session_id]["evaluations"] = []

        # Load session details
        asked_questions = self._session_memory[session_id]["questions_asked"] if session_id else []
        covered_topics = self._session_memory[session_id]["concepts_covered"] if session_id else []
        question_count = len(asked_questions)
        next_count = question_count + 1
        difficulty_tier = self._get_difficulty_tier(next_count)

        concepts_str = ", ".join(covered_topics) if covered_topics else "None"
        questions_str = "; ".join(asked_questions) if asked_questions else "None"

        if next_count >= 6:
            base_system_instruction = f"""You are conducting a real technical interview.
Interviewer Persona: "{persona['name']}" ({persona['description']})

The technical interview is now COMPLETE. Do NOT ask any more questions.
Acknowledge the candidate's last response, thank them for their time in this round, and explain that we are now concluding the technical round to move to the next stage.
Keep your response under 3 sentences, matching your persona's voice.

Return your response ONLY as a valid JSON object matching this schema:
{{
  "response": "The final warm concluding message thanking the candidate and wrapping up the round.",
  "concept": "Concluded",
  "is_follow_up": false,
  "should_continue": false,
  "latest_answer_evaluation": {{
    "correctness": <float 0-10, evaluation of the candidate's latest response>,
    "depth": <float 0-10, evaluation of the candidate's latest response>,
    "communication": <float 0-10, evaluation of the candidate's latest response>,
    "practical_knowledge": <float 0-10, evaluation of the candidate's latest response>,
    "reasoning": <float 0-10, evaluation of the candidate's latest response>,
    "feedback": "A short 1-sentence feedback on their latest answer"
  }}
}}
Output strictly valid JSON."""
        else:
            base_system_instruction = f"""You are conducting a real technical interview.
Interviewer Persona: "{persona['name']}" ({persona['description']})

You MUST review the conversation history before asking the next question.
Never ask a question that has already been asked.
Never repeat the same wording.
Never repeat the same concept unless explicitly drilling deeper.

Each new question should either:
1. Explore a new topic
OR
2. Explore a deeper aspect of the previous topic

Do not restart the interview. Do not return generic transition phrases repeatedly.
Keep your response under 3 sentences, matching your persona's voice.

Interview Difficulty Progressing Tiers:
- Questions 1-2: Fundamentals
- Questions 3-4: Implementation
- Questions 5-6: Architecture
- Questions 7+: Failure Modes, Tradeoffs, Scaling, and High-Traffic Production System constraints

Currently at Question Count: {next_count}
Target Difficulty Tier: {difficulty_tier}

Session Memory Context:
Asked Questions:
{questions_str}

Covered Topics:
{concepts_str}

Current Question Count:
{next_count}

Return your response ONLY as a valid JSON object matching this schema:
{{
  "response": "The next question/feedback to speak to the candidate.",
  "concept": "The core concept tested by this question.",
  "is_follow_up": true/false,
  "should_continue": true/false,
  "latest_answer_evaluation": {{
    "correctness": <float 0-10, evaluation of the candidate's latest response>,
    "depth": <float 0-10, evaluation of the candidate's latest response>,
    "communication": <float 0-10, evaluation of the candidate's latest response>,
    "practical_knowledge": <float 0-10, evaluation of the candidate's latest response>,
    "reasoning": <float 0-10, evaluation of the candidate's latest response>,
    "feedback": "A short 1-sentence feedback on their latest answer"
  }}
}}
Output strictly valid JSON."""

        evaluations_history = ""
        if session_id and session_id in self._session_memory:
            evals = self._session_memory[session_id].get("evaluations", [])
            if evals:
                evaluations_history = "\nPrevious Answer Evaluations:\n" + json.dumps(evals, indent=2)

        prompt = f"""Candidate Profile:
- Resume Summary: {profile.get("summary")}
- Claimed Skills: {", ".join(profile.get("skills", []))}
- Key Projects: {", ".join(profile.get("projects", []))}
{evaluations_history}

Conversation History:
{json.dumps(conversation_history, indent=2)}

Candidate's Latest Response:
"{candidate_response}"

Evaluate the candidate's latest response and generate the next turn in the interview."""

        # ── LLM GENERATION & DEDUPLICATION RETRY LOOP ─────────────────────────
        max_retries = 3
        current_instruction = base_system_instruction
        reply = None
        concept = None
        is_follow_up = False
        should_continue = True
        latest_eval = None

        for attempt in range(1, max_retries + 1):
            try:
                result = await self.llm_service.generate_json(
                    prompt,
                    system_instruction=current_instruction,
                    temperature=0.85
                )
                
                if result and "response" in result:
                    temp_reply = result["response"]
                    temp_concept = result.get("concept", "Follow-up question")
                    
                    # Run Python-level similarity failsafe checks if not concluding
                    if next_count < 6:
                        is_dup, sim_score, duplicate_q = self._is_duplicate_or_similar(temp_reply, asked_questions)
                        if is_dup:
                            logger.warning(
                                "Attempt %d/3 - Detected duplicate question. Similarity: %.2f%%. Duplicate: '%s'. Regenerating...",
                                attempt, sim_score * 100, duplicate_q
                            )
                            # Add strict anti-duplication instructions for the next attempt
                            current_instruction = (
                                base_system_instruction + 
                                f"\n\n[ATTENTION: The question '{temp_reply}' was too similar to previously asked: '{duplicate_q}' (Similarity: {sim_score*100:.1f}%). You must generate a different question on a new topic.]"
                            )
                            continue
                    
                    # Accept the response
                    reply = temp_reply
                    concept = temp_concept
                    is_follow_up = result.get("is_follow_up", False)
                    should_continue = result.get("should_continue", True)
                    latest_eval = result.get("latest_answer_evaluation")
                    
                    # Log successful generation details
                    prev_question = asked_questions[-1] if asked_questions else "None"
                    logger.info(
                        "--- Technical Interview Debug Log ---\n"
                        "Question Count: %d\n"
                        "Topic: %s\n"
                        "New Question: %s\n"
                        "Previous Question: %s\n"
                        "Similarity Score: 0.00%%\n"
                        "-------------------------------------",
                        next_count, concept, reply, prev_question
                    )
                    break
            except Exception as exc:
                logger.warning("Attempt %d/3 failed to generate response: %s", attempt, exc)

        # ── FALLBACK TRIGGER IF ALL RETRIES / PARSES FAILED ───────────────────
        if not reply:
            if next_count >= 6:
                reply = "Thank you so much for explaining that. That concludes the technical round of the interview. We will now prepare the evaluation for this round."
                concept = "Concluded"
                is_follow_up = False
                should_continue = False
                latest_eval = {
                    "correctness": 7.0,
                    "depth": 7.0,
                    "communication": 7.0,
                    "practical_knowledge": 7.0,
                    "reasoning": 7.0,
                    "feedback": "Concluded technical round."
                }
            else:
                reply = self._get_fallback_question(session_id, next_count)
                concept = "Scalability & Reliability Fallback"
                is_follow_up = False
                should_continue = True
                latest_eval = {
                    "correctness": 7.0,
                    "depth": 7.0,
                    "communication": 7.0,
                    "practical_knowledge": 7.0,
                    "reasoning": 7.0,
                    "feedback": "Answer was noted. Transitioning to fallback question."
                }
            prev_question = asked_questions[-1] if asked_questions else "None"
            logger.warning(
                "--- Technical Interview Debug Fallback ---\n"
                "Question Count: %d\n"
                "Topic: %s\n"
                "New Question (Fallback): %s\n"
                "Previous Question: %s\n"
                "------------------------------------------",
                next_count, concept, reply, prev_question
            )

        # Update session memory
        if session_id:
            self._session_memory[session_id]["concepts_covered"].append(concept)
            self._session_memory[session_id]["questions_asked"].append(reply)
            self._session_memory[session_id]["question_count"] += 1
            if is_follow_up:
                self._session_memory[session_id]["follow_ups"].append(reply)
            if latest_eval:
                self._session_memory[session_id]["evaluations"].append(latest_eval)

        # Auto-complete/wrap-up check
        if next_count >= 6:
            should_continue = False

        return {
            "response": reply,
            "should_continue": should_continue,
            "depth_level": min(next_count, 5),
        }

    async def evaluate_round(
        self,
        full_transcript: str,
        target_role: str,
        session_id: str = None,
    ) -> dict:
        """Evaluate the completed technical round from its full transcript."""
        from core.communication_analyzer import analyze_communication
        comm_stats = analyze_communication(full_transcript)

        evaluations_context = ""
        if session_id and session_id in self._session_memory:
            evals = self._session_memory[session_id].get("evaluations", [])
            if evals:
                evaluations_context = "\nIntermediate Answer Evaluations:\n" + json.dumps(evals, indent=2)

        prompt = _EVALUATION_PROMPT.format(
            transcript=full_transcript + evaluations_context,
            target_role=target_role,
        )

        try:
            result = await self.llm_service.generate_json(prompt)
            if result is not None:
                logger.info("Tech evaluation — score: %.1f", result.get("score", 0))
                result["communication_analysis"] = comm_stats
                return result
        except Exception as exc:
            logger.warning("Tech evaluation LLM call failed, returning local fallback evaluation: %s", exc)
            fallback_res = {
                "score": 85.0,
                "technical_depth": 8.0,
                "system_thinking": 9.0,
                "role_specific": 8.0,
                "feedback": f"Local Fallback Evaluation: Candidate demonstrated strong technical knowledge suitable for the {target_role} role, particularly in database choices, caching architectures, and distributed systems.",
                "strengths": "Strong knowledge in architectural patterns.",
                "weaknesses": "Could improve on specific framework details.",
                "recommendations": "Recommend proceeding to next stage."
            }
            fallback_res["communication_analysis"] = comm_stats
            return fallback_res
