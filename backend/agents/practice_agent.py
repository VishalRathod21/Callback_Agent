import random
import json
import logging
import asyncio

logger = logging.getLogger(__name__)


class PracticeAgent:
    """
    Quick practice mode agent.
    Generates rapid-fire questions and gives instant 1-paragraph feedback per answer.
    No full interview protocol — fast, focused, no frills.
    """
    
    QUESTION_POOLS = {
        "dsa_theory": [
            "What is the time complexity of quicksort in the worst case and why?",
            "Explain the difference between BFS and DFS. When would you use each?",
            "What is dynamic programming? Give a problem where it shines over recursion.",
            "How does a hash map handle collisions? What are the common techniques?",
            "Explain the sliding window technique. What type of problems does it solve?",
            "What is the difference between a stack and a queue? Give real-world examples.",
            "When would you use a heap over a sorted array?",
            "What is memoization? How is it different from tabulation?",
            "Explain graph traversal — how do you detect a cycle in a directed graph?",
            "What is the two-pointer technique? Give an example problem.",
            "Difference between O(log n) and O(n log n). Which algorithms fall into each?",
            "What is a trie? When is it more efficient than a hash map for string lookups?",
            "How does merge sort guarantee O(n log n) in all cases unlike quicksort?",
            "Explain amortized time complexity with the example of dynamic arrays.",
            "What is the difference between an in-order, pre-order, and post-order traversal?"
        ],
        "system_design": [
            "How would you design a URL shortener like bit.ly? Focus on the data model.",
            "What is the CAP theorem? Give a real example of a system choosing CP vs AP.",
            "How does database sharding work? What are the tradeoffs?",
            "Explain the difference between vertical and horizontal scaling.",
            "How would you design a notification system for 100 million users?",
            "What is a message queue and when would you use Kafka vs Redis Pub/Sub?",
            "How does CDN work and what types of content benefit most from it?",
            "Explain the read-through vs write-through caching strategies.",
            "How would you design a rate limiter? What data structures would you use?",
            "What is database connection pooling and why does it matter at scale?",
            "How does consistent hashing solve the problem of adding/removing cache nodes?",
            "What is the difference between REST and GraphQL? When to choose each?",
            "How would you ensure high availability in a microservices architecture?",
            "Explain event sourcing and how it differs from traditional CRUD.",
            "How would you design a search autocomplete system?"
        ],
        "behavioral": [
            "Tell me about a project you're most proud of and why.",
            "Describe a time you had to learn a new technology quickly under pressure.",
            "How do you handle disagreements with teammates about technical decisions?",
            "Tell me about a bug that took you a long time to fix. What made it hard?",
            "Describe a situation where you had to prioritize between multiple tasks.",
            "How do you approach code review — what do you look for?",
            "Tell me about a time a project didn't go as planned. What did you do?",
            "How do you keep up with new developments in AI and software engineering?",
            "Describe your approach when you're stuck on a problem for a long time.",
            "What's the most complex system you've built? Walk me through the architecture.",
            "Tell me about a time you received critical feedback. How did you respond?",
            "How do you estimate time for tasks with uncertain requirements?",
            "Describe a situation where you had to work with a difficult team member.",
            "What motivates you to do your best work?",
            "Tell me about a time you went above and beyond what was asked."
        ]
    }
    
    def __init__(self, model=None, llm_service=None):
        from services.llm_service import llm_service as global_llm_service
        self.llm_service = llm_service or global_llm_service
    
    async def get_questions(
        self,
        topic: str,
        target_role: str = "Software Engineer",
        count: int = 6,
        resume_structured: dict = None
    ) -> list[dict]:
        """
        Get practice questions for a topic.
        Returns list of question objects with metadata.
        """
        
        if topic == "random":
            all_q = []
            for pool in self.QUESTION_POOLS.values():
                all_q.extend(pool)
            selected = random.sample(all_q, min(count, len(all_q)))
        elif topic in self.QUESTION_POOLS:
            pool = self.QUESTION_POOLS[topic]
            selected = random.sample(pool, min(count, len(pool)))
        else:
            selected = random.sample(self.QUESTION_POOLS["dsa_theory"], count)
        
        # If resume available, inject 1-2 resume-specific questions
        if resume_structured and topic != "dsa_theory":
            projects = resume_structured.get("projects", [])
            if projects:
                proj = random.choice(projects)
                resume_q = f"You worked on {proj['name']} — {proj.get('description', '')}. Walk me through the key technical decisions you made."
                selected[-1] = resume_q  # replace last question
        
        return [
            {
                "id": i + 1,
                "question": q,
                "topic": topic,
                "answered": False,
                "score": None,
                "feedback": None
            }
            for i, q in enumerate(selected)
        ]
    
    async def evaluate_answer(
        self,
        question: str,
        answer: str,
        topic: str
    ) -> dict:
        """
        Give instant feedback on a practice answer.
        Fast, focused, 3-4 sentences max.
        """
        
        topic_context = {
            "dsa_theory": "algorithmic thinking and technical accuracy",
            "system_design": "system design principles and scalability thinking", 
            "behavioral": "STAR method (Situation, Task, Action, Result) and communication clarity",
            "random": "accuracy and communication"
        }.get(topic, "accuracy and communication")
        
        prompt = f"""You are an interview coach giving instant feedback on a practice answer.

Question: {question}

Candidate answered: "{answer}"

Evaluate for: {topic_context}

Give feedback in this EXACT JSON format:
{{
  "score": <0-10 integer>,
  "verdict": "strong" | "decent" | "needs_work",
  "strength": "1 sentence on what was good",
  "gap": "1 sentence on what was missing or could be better",
  "tip": "1 specific, actionable improvement for next time"
}}

Be direct and specific. Reference their actual answer. No generic advice."""
        
        try:
            return await self.llm_service.generate_json(prompt, temperature=0.5)
        except Exception as e:
            logger.error(f"Practice eval error: {e}")
            return {
                "score": 5,
                "verdict": "decent",
                "strength": "You provided an answer.",
                "gap": "Could not evaluate in detail.",
                "tip": "Try to be more specific with examples."
            }
