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
    # Tiers 1-2: CS Fundamentals / Theoretical
    "Can you explain how garbage collection works in your language of choice (e.g., Python's reference counting/generational collection vs. Go's concurrent mark-and-sweep or Java's G1GC), and how it impacts application latency?",
    "Could you explain the difference between thread-safety models like reentrant locks, optimistic locking, and compare-and-swap (CAS) operations, and when you would use each in application code?",
    
    # Tiers 3-4: Application-based / Concrete Implementation
    "If you had to integrate a third-party REST API that is notoriously slow and has strict rate-limiting, how would you design your application layer (caching, queueing, retries) to shield your users and maintain responsive UI latency?",
    "How would you handle race conditions and concurrency control in a microservice where multiple concurrent database requests attempt to update a shared resource, like a user's wallet balance?",
    
    # Tiers 5-6: Real-world Problem Solving & Debugging
    "Imagine a production issue where CPU utilization spikes to 100% every day at 12 PM, but database load remains normal. How would you systematically troubleshoot and identify the root cause of this issue?",
    "If your application began experiencing memory leaks causing container restarts every 48 hours, what profiling tools and systematic steps would you use to isolate the leak in production?",
    
    # Tiers 7+: Scaling, Architecture & Tradeoffs
    "How would you optimize this system's data ingestion layer to handle 10x the current load under heavy write pressure?",
    "When a downstream service goes down, how would you configure circuit breakers and retry policies to prevent cascading system-wide failures?",
]

# ── Prompts ────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior technical interviewer conducting a comprehensive technical interview.
Rules:
- Focus on four core pillars:
  1. Theoretical & CS Fundamentals (memory management, language runtime internals, OS/concurrency, networking protocols, algorithm complexities).
  2. Application-based implementation (framework/library trade-offs, schema choices, practical coding design, library integration).
  3. Real-world problem solving & debugging (troubleshooting memory leaks, 100% CPU utilization spikes, race conditions, third-party API rate limits).
  4. System design and architectural scaling.
- Start with the candidate's resume to ask relevant questions that verify their experience.
- Maintain a structured progression through core concepts, application details, practical debugging, and architectural trade-offs.
- Follow up on every answer to challenge their reasoning, trade-offs, and edge cases.
- Keep responses under 3 sentences.
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
            return "CS Fundamentals & Theoretical Concepts (e.g., memory models, language runtime internals, threading, networking protocols, algorithm complexes)"
        elif question_count <= 4:
            return "Application-based & Practical Coding Choices (e.g., schema design, concurrent data access, caching invalidation, integration trade-offs)"
        elif question_count <= 6:
            return "Real-world Problem Solving & Debugging (e.g., troubleshooting memory leaks, CPU utilization spikes, race conditions, rate limit policies)"
        else:
            return "High-Scale System Architecture, Reliability, and Trade-offs (e.g., partitioning, event-driven scaling, cascading failures)"


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
        resume_structured: dict = None,
        session_id: str = None,
        persona: dict = None,
        resume_text: str = None
    ) -> str:
        if resume_text is not None and resume_structured is None:
            # OLD LOGIC for compatibility with tests
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

        else:
            # NEW LOGIC
            if resume_structured is None:
                resume_structured = {}
            
            # Pick a random project or experience to ask about
            projects = resume_structured.get("projects", [])
            experience = resume_structured.get("experience", [])
            skills = resume_structured.get("skills", [])
            
            # Build rich resume context for the prompt
            resume_context = self._build_resume_context(resume_structured)
            
            # Pick random starting focus (project, role, or skill)
            import random
            focus_options = []
            if projects:
                focus_options.extend([f"project: {p['name']}" for p in projects[:3]])
            if experience:
                focus_options.extend([f"role: {e['role']} at {e['company']}" for e in experience[:2]])
            if skills:
                sample_skills = random.sample(skills, min(3, len(skills)))
                focus_options.append(f"skills: {', '.join(sample_skills)}")
            
            chosen_focus = random.choice(focus_options) if focus_options else "general technical background"
            
            prompt = f"""You are a senior technical interviewer conducting a {target_role} interview.

CANDIDATE'S RESUME:
{resume_context}

Start the interview with ONE specific, personalized question about their {chosen_focus}.
The question must:
- Reference something SPECIFIC from their resume (project name, company, technology they actually used)
- Not be a question they could answer without having done that work
- Be conversational, 1-2 sentences maximum
- NOT say "I see on your resume..." — just ask directly
- NOT be generic like "Tell me about yourself"

Return ONLY the question text, nothing else."""

            try:
                response_text = await self.llm_service.generate(
                    prompt,
                    temperature=0.9
                )
                return response_text.strip()
            except Exception as e:
                logger.warning("Tech get_opening_question LLM call failed, using fallback: %s", e)
                return f"To start off, could you tell me about a recent technical project you worked on, the challenges you faced, and how you made the architectural choices?"

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

    async def respond_to_answer(
        self,
        conversation_history: list,
        candidate_response: str,
        resume_structured: dict = None,
        session_id: str = None,
        persona: dict = None,
        target_role: str = "Software Engineer",
        resume_text: str = None
    ) -> dict:
        if resume_text is not None and resume_structured is None:
            # OLD LOGIC for compatibility with tests
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
                base_system_instruction = f"""You are conducting a real technical interview for the role of: "{target_role}".
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
                base_system_instruction = f"""You are conducting a real technical interview for the role of: "{target_role}".
Interviewer Persona: "{persona['name']}" ({persona['description']})

You MUST review the conversation history before asking the next question.
Never ask a question that has already been asked.
Never repeat the same wording.
Never repeat the same concept unless explicitly drilling deeper.

CRITICAL BEHAVIOR RULES:
- Never reveal or output your reasoning, thinking process, planning, or chain of thought.
- Never output tags such as <think>, <analysis>, or similar.
- Speak naturally and conversationally, producing only the final spoken response.
- Ask exactly ONE focused question at a time.
- Wait for the candidate's response before asking the next question.
- Never generate sample answers, code templates, or script cues for the candidate.
- Never explain what you will ask next or meta-describe the interview structure.

CRITICAL REQUIREMENT:
Each new question MUST be strictly relevant to the target job role ("{target_role}") and tailored to the candidate's resume (specifically their projects, claimed skills, and experience).
Ensure your questions cover:
1. CS Fundamentals & Theory: OS/threading, memory models, runtime internals, networking protocols, algorithm trade-offs.
2. Application-based design: Schema implementation, API choices, concrete libraries, concurrency primitives.
3. Real-world problem solving: Troubleshooting production spikes, memory leaks, Slow endpoints, caching bottlenecks, rate limit failures.
4. Scale & Architecture: Distributed systems, microservices, queuing, partition designs.

Keep your response under 3 sentences, matching your persona's voice.

Interview Difficulty Progressing Tiers:
- Questions 1-2: CS Fundamentals, Language internals, & Theory (tailored to resume)
- Questions 3-4: Application-based, Practical schema choices & Concurrency (tailored to resume)
- Questions 5-6: Real-world problem solving & Debugging production issues (tailored to resume)
- Questions 7+: Scale, Systems design, Partitioning, & Failure modes

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
  "response": "The next single question/feedback to speak to the candidate. Keep it concise, natural, and free of any thinking process, reasoning, tags, or sample answers.",
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

            prompt = f"""Candidate Profile for {target_role}:
- Target Role: {target_role}
- Resume Summary: {profile.get("summary")}
- Claimed Skills: {", ".join(profile.get("skills", []))}
- Key Projects: {", ".join(profile.get("projects", []))}
{evaluations_history}

Conversation History:
{json.dumps(conversation_history, indent=2)}

Candidate's Latest Response:
"{candidate_response}"

Evaluate the candidate's latest response and generate the next turn in the interview tailored to their resume and the role of {target_role}."""

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

        else:
            # NEW LOGIC
            resume_context = ""
            if resume_structured:
                resume_context = f"""
CANDIDATE RESUME CONTEXT (use this to ask relevant follow-ups):
{self._build_resume_context(resume_structured)}
"""
            
            # Build conversation string
            conv = "\n".join([
                f"{'Interviewer' if e.get('role', e.get('speaker'))=='interviewer' else 'Candidate'}: {e.get('content', e.get('text', ''))}"
                for e in conversation_history[-8:]  # last 8 turns for context
            ])
            
            prompt = f"""You are a senior technical interviewer.
{resume_context}

CONVERSATION SO FAR:
{conv}

The candidate just said: "{candidate_response}"

Your job:
1. Ask ONE follow-up question that goes DEEPER on what they just said
2. OR pivot to another specific item from their resume they haven't discussed yet
3. Keep it conversational, 1-3 sentences max
4. If they mentioned a technology, ask about a specific challenge or decision
5. If their answer was shallow, probe deeper: "Can you be more specific about X?"
6. After 6 exchanges, set should_continue to false

Return JSON only:
{{
  "response": "your follow-up question or comment + question",
  "should_continue": true/false,
  "topic_covered": "brief label of what was just discussed"
}}"""

            try:
                response_text = await self.llm_service.generate(
                    prompt,
                    temperature=0.8
                )
                text = response_text.strip()
                if "```" in text:
                    text = text.split("```")[1].lstrip("json").strip()
                if text.startswith("json"):
                    text = text[4:].strip()
                if text.endswith("```"):
                    text = text[:-3].strip()
                return json.loads(text)
            except Exception as e:
                logger.warning("Tech respond_to_answer LLM call failed, returning fallback: %s", e)
                asked = [
                    turn.get("text", turn.get("content", ""))
                    for turn in conversation_history
                    if turn.get("speaker") == "interviewer" or turn.get("role") == "interviewer"
                ]
                # Check if we should conclude the round (6 exchanges max)
                if len(asked) >= 5:
                    return {
                        "response": "Thank you for sharing that. That concludes the technical round of our interview. We will now prepare the evaluation for this stage.",
                        "should_continue": False,
                        "topic_covered": "conclusion"
                    }
                
                # Find a unique fallback question
                fallback_q = None
                for cand in _FALLBACK_QUESTIONS:
                    is_dup, _, _ = self._is_duplicate_or_similar(cand, asked)
                    if not is_dup:
                        fallback_q = cand
                        break
                
                if not fallback_q:
                    fallback_q = "Could you tell me about the challenges you faced with deployment pipelines and production scaling in your past role?"
                
                return {
                    "response": fallback_q,
                    "should_continue": True,
                    "topic_covered": "general_fallback"
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
