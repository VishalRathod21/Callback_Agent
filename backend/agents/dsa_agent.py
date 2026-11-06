"""DSA interview agent.

Conducts the code-editor based Data Structures & Algorithms round:

* generates LeetCode-style problems at a requested difficulty, avoiding
  patterns/titles already used in the session,
* provides on-demand hints,
* evaluates submissions (correctness reasoning, edge cases, complexity),
* asks a conceptual follow-up (complexity / alternative approach) per problem,
* aggregates the round.

Difficulty between problems is chosen by the shared ``DifficultyPolicy`` using
the previous submission's score, so the DSA round is adaptive like the others.

When the LLM is unavailable the agent uses a curated problem bank and returns
an *unscored* evaluation (``evaluation_source="unavailable"``) rather than
pretending the code was correct.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random

from services.llm_service import llm_service as global_llm_service, LLMUnavailableError
from agents.difficulty_policy import DifficultyPolicy, normalize_level, default_policy

logger = logging.getLogger(__name__)


class DSAInterviewAgent:
    SYSTEM_PROMPT = """You are a senior DSA interviewer at a top tech company conducting a coding round.
The candidate writes code in an editor and may optionally explain their approach.
- Present clear coding problems with examples and constraints.
- Review submitted code for correctness, edge cases, time/space complexity.
- If an explanation is provided, factor in the reasoning process.
- Give hints only when explicitly requested, never proactively.
- Be precise and technical, like a real engineering interviewer. Return ONLY JSON when asked for JSON."""

    DSA_PATTERNS = [
        "Arrays", "Hashing", "Two Pointers", "Sliding Window", "Binary Search", "Linked List", "Trees",
        "Graphs", "Dynamic Programming", "Backtracking", "Heap", "Intervals", "Trie", "Greedy",
        "Bit Manipulation", "Union Find", "Topological Sort", "Monotonic Stack",
    ]

    # Patterns that fit each difficulty level best (used for selection + fallback bank)
    PATTERNS_BY_LEVEL = {
        "easy": ["Arrays", "Hashing", "Two Pointers", "Sliding Window", "Binary Search", "Linked List"],
        "medium": ["Trees", "Graphs", "Intervals", "Heap", "Greedy", "Monotonic Stack", "Sliding Window"],
        "hard": ["Dynamic Programming", "Backtracking", "Trie", "Union Find", "Topological Sort", "Graphs"],
    }

    def __init__(self, llm_service=None, model_name: str = None, policy: DifficultyPolicy | None = None) -> None:
        self.llm_service = llm_service or global_llm_service
        self.policy = policy or default_policy
        self._session_asked: dict[str, set] = {}
        self._session_asked_titles: dict[str, list] = {}
        self._session_patterns: dict[str, set] = {}

    # ── helpers ────────────────────────────────────────────────────────────
    def _get_question_hash(self, title: str) -> str:
        return hashlib.sha256(title.strip().lower().encode("utf-8")).hexdigest()

    def _remember(self, session_id: str | None, title: str, pattern: str) -> None:
        if not session_id:
            return
        self._session_asked.setdefault(session_id, set()).add(self._get_question_hash(title))
        self._session_asked_titles.setdefault(session_id, []).append(title)
        self._session_patterns.setdefault(session_id, set()).add(pattern)

    def next_difficulty(self, previous_evaluation: dict | None, current: str, adaptive: bool = True) -> dict:
        """Decide the next problem difficulty from the previous submission."""
        policy = self.policy if adaptive else DifficultyPolicy(enabled=False)
        score10 = None
        if previous_evaluation and previous_evaluation.get("overall_score") is not None:
            score10 = float(previous_evaluation["overall_score"]) / 10.0
        return policy.decide(score10, normalize_level(current)).to_dict()

    async def _extract_candidate_profile(self, resume_text: str) -> dict:
        """Legacy helper kept for compatibility; prefers a structured profile when given."""
        if not resume_text:
            return {"summary": "Not provided", "projects": [], "skills": []}
        prompt = f"""Analyze the candidate's resume text below and extract a raw JSON object:
{{"summary": "1-2 sentence technical summary", "projects": ["Project A"], "skills": ["Skill 1"]}}
Output ONLY valid JSON.

Resume Text:
{resume_text[:4000]}
"""
        try:
            result = await self.llm_service.generate_json(prompt)
            if result:
                return result
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to extract candidate profile: %s", e)
        return {"summary": "Candidate with technical background", "projects": [], "skills": []}

    # ── problems ───────────────────────────────────────────────────────────
    async def get_problem(
        self,
        target_role: str,
        difficulty: str = "medium",
        resume_text: str = "",
        session_id: str = None,
        resume_structured: dict | None = None,
    ) -> dict:
        """Generate a unique, standard DSA problem at ``difficulty``."""
        difficulty = normalize_level(difficulty)
        asked_patterns = list(self._session_patterns.get(session_id, set())) if session_id else []
        preferred = [p for p in self.PATTERNS_BY_LEVEL[difficulty] if p not in asked_patterns]
        available = preferred or [p for p in self.DSA_PATTERNS if p not in asked_patterns] or self.DSA_PATTERNS
        selected_pattern = random.choice(available)

        if resume_structured:
            skills = ", ".join((resume_structured.get("skills") or [])[:12]) or "None specified"
        else:
            profile = await self._extract_candidate_profile(resume_text) if resume_text and self.llm_service.available else {}
            skills = ", ".join(profile.get("skills", [])) or "None specified"

        asked_titles = self._session_asked_titles.get(session_id, []) if session_id else []
        asked_str = ", ".join(asked_titles) if asked_titles else "None"

        prompt = f"""Generate a standard, well-known LeetCode question (or a high-quality equivalent) with difficulty "{difficulty}".

Algorithmic pattern to test: "{selected_pattern}"
Candidate's primary languages/skills (for starter code only): {skills}
Previously asked in this session (never repeat): {asked_str}

RULES:
1. Standard, recognisable problem that tests "{selected_pattern}"; LeetCode style description, examples and constraints.
2. No business-scenario theming. Precise, clean statement.
3. Return ONLY a raw JSON object:
{{
  "title": "Problem Title",
  "description": "...",
  "examples": [{{"input": "...", "output": "...", "explanation": "..."}}],
  "constraints": ["..."],
  "starter_code": {{"python": "def solution(...):\\n    pass", "javascript": "function solution(...) {{\\n}}"}},
  "difficulty": "{difficulty}",
  "pattern": "{selected_pattern}",
  "concept_question": "One short conceptual question to ask after submission (e.g. about complexity or an alternative approach)."
}}"""

        try:
            result = await self.llm_service.generate_json(prompt, system_instruction=self.SYSTEM_PROMPT, temperature=0.9)
            if result and result.get("title") and result.get("description"):
                result["difficulty"] = difficulty
                result.setdefault("pattern", selected_pattern)
                result["generation_source"] = "llm"
                result.setdefault("concept_question", "What is the time and space complexity of your solution, and could it be improved?")
                self._remember(session_id, result["title"], result["pattern"])
                return result
        except LLMUnavailableError:
            logger.info("DSA problem generation: LLM unavailable — using problem bank.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("DSA get_problem LLM call failed, using problem bank: %s", exc)

        fallback = self._get_fallback_problem(difficulty, selected_pattern, asked_titles)
        fallback["generation_source"] = "bank"
        self._remember(session_id, fallback["title"], fallback["pattern"])
        return fallback

    async def get_hint(self, problem: dict, current_code: str, conversation_history: list) -> str:
        prompt = f"""The candidate is working on this DSA problem:
{json.dumps({k: problem.get(k) for k in ('title', 'description', 'constraints')}, indent=2)}

Their current code:
```
{current_code[:6000]}
```

Previous submissions/evaluations (if any): {json.dumps(conversation_history[-2:], indent=2)}

The candidate explicitly asked for a hint. Return ONE targeted hint (1-2 sentences) that nudges them
toward the right idea without giving the solution or code."""
        try:
            response = await self.llm_service.generate(prompt, system_instruction=self.SYSTEM_PROMPT, temperature=0.4)
            return response.strip()
        except LLMUnavailableError:
            return self._bank_hint(problem)
        except Exception as exc:  # noqa: BLE001
            logger.warning("DSA get_hint LLM call failed: %s", exc)
            return self._bank_hint(problem)

    @staticmethod
    def _bank_hint(problem: dict) -> str:
        pattern = (problem or {}).get("pattern", "")
        hints = {
            "Two Pointers": "Think about moving two indices toward each other and what invariant lets you discard one side.",
            "Sliding Window": "Maintain a window with a running state; expand on the right and shrink on the left when the constraint breaks.",
            "Hashing": "A hash map lets you trade memory for O(1) lookups of what you have already seen.",
            "Binary Search": "Ask what monotonic property lets you halve the search space each step.",
            "Graphs": "Model the input as nodes and edges; BFS/DFS from each unvisited node and mark visited cells.",
            "Dynamic Programming": "Define the sub-problem precisely (what does dp[i] mean?) and write its recurrence before coding.",
            "Trees": "Consider recursion that returns information from children to the parent.",
            "Intervals": "Sort by start first; then a single pass can merge or count overlaps.",
            "Heap": "A heap gives you the current min/max in O(log n); what do you need repeatedly?",
        }
        return hints.get(pattern, "Restate the problem in terms of the data structure that gives you the needed operation in O(1) or O(log n).")

    # ── evaluation ─────────────────────────────────────────────────────────
    async def evaluate_submission(self, problem: dict, submitted_code: str, language: str,
                                  verbal_explanation: str = None, hints_used: int = 0) -> dict:
        """Evaluate a code submission (LLM-based static reasoning)."""
        prompt = f"""You are evaluating a candidate's code submission.
Problem:
{json.dumps({k: problem.get(k) for k in ('title', 'description', 'examples', 'constraints')}, indent=2)}

Submitted code ({language}):
```
{submitted_code[:12000]}
```
Candidate explanation (optional): {verbal_explanation or "None provided"}
Hints used: {hints_used}

Trace the code against the examples and edge cases (empty input, single element, duplicates, negatives, bounds).
Be strict: placeholder code, `pass`, or code that does not address the problem is NOT correct.

Return ONLY JSON:
{{
  "correct": true|false,
  "time_complexity": "O(...)",
  "space_complexity": "O(...)",
  "edge_cases_handled": ["..."],
  "edge_cases_missed": ["..."],
  "code_quality_notes": "...",
  "approach_score": <0-10>,
  "correctness_score": <0-10>,
  "complexity_score": <0-10>,
  "communication_score": <0-10 or null if no explanation>,
  "overall_score": <0-100>,
  "feedback": "2-3 specific, actionable sentences"
}}"""
        try:
            result = await self.llm_service.generate_json(prompt, system_instruction=self.SYSTEM_PROMPT, temperature=0.2)
            if result is not None and "overall_score" in result:
                result["evaluation_source"] = "llm"
                result["hints_used"] = hints_used
                result["problem_title"] = problem.get("title")
                result["difficulty"] = problem.get("difficulty")
                result["pattern"] = problem.get("pattern")
                return result
        except LLMUnavailableError:
            logger.info("DSA evaluate_submission: LLM unavailable.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("DSA evaluate_submission LLM call failed: %s", exc)
        return self._unscored_evaluation(problem, submitted_code, hints_used)

    async def evaluate_round(self, all_submissions: list[dict]) -> dict:
        """Aggregate the DSA round. Programmatic aggregation is the source of truth; the LLM adds narrative."""
        scored = [s for s in all_submissions if s.get("overall_score") is not None]
        count = len(all_submissions)
        if not scored:
            return {
                "score": None, "problems_solved": 0, "problems_attempted": count,
                "avg_correctness": None, "avg_complexity_awareness": None,
                "evaluation_source": "unavailable",
                "feedback": "Submissions could not be evaluated because the AI evaluator was unavailable.",
                "per_problem": all_submissions,
            }
        avg_score = round(sum(float(s["overall_score"]) for s in scored) / len(scored), 1)
        avg_corr = round(sum(float(s.get("correctness_score", 0) or 0) for s in scored) / len(scored), 1)
        avg_comp = round(sum(float(s.get("complexity_score", s.get("approach_score", 0)) or 0) for s in scored) / len(scored), 1)
        solved = sum(1 for s in scored if s.get("correct"))
        result = {
            "score": avg_score,
            "problems_solved": solved,
            "problems_attempted": count,
            "avg_correctness": avg_corr,
            "avg_complexity_awareness": avg_comp,
            "evaluation_source": "llm" if len(scored) == count else "mixed",
            "difficulty_trace": [s.get("difficulty") for s in all_submissions],
            "per_problem": all_submissions,
            "feedback": (
                f"Attempted {count} problem(s), {solved} judged correct. Average score {avg_score}/100, "
                f"correctness {avg_corr}/10, complexity awareness {avg_comp}/10."
            ),
        }
        try:
            narrative = await self.llm_service.generate_json(
                f"""Summarise this DSA round in JSON {{"feedback": "2-3 sentences on strengths and what to practise",
"strengths": ["..."], "weaknesses": ["..."], "learning_topics": ["..."]}} based ONLY on these evaluations:
{json.dumps(all_submissions, indent=2)[:8000]}""",
                system_instruction=self.SYSTEM_PROMPT, temperature=0.3,
            )
            if narrative and narrative.get("feedback"):
                result["feedback"] = narrative["feedback"]
                result["strengths"] = narrative.get("strengths", [])
                result["weaknesses"] = narrative.get("weaknesses", [])
                result["learning_topics"] = narrative.get("learning_topics", [])
        except Exception:  # noqa: BLE001
            pass
        return result

    # ── fallbacks ──────────────────────────────────────────────────────────
    PROBLEM_BANK: dict[str, dict] = {
        "Two Pointers": {
            "title": "Container With Most Water",
            "description": "You are given an integer array height of length n. There are n vertical lines drawn such that the two endpoints of the ith line are (i, 0) and (i, height[i]). Find two lines that together with the x-axis form a container that holds the most water. Return the maximum amount of water a container can store.",
            "examples": [{"input": "height = [1,8,6,2,5,4,8,3,7]", "output": "49", "explanation": "Lines at index 1 and 8 form the largest container: min(8,7) * 7 = 49."}],
            "constraints": ["n == height.length", "2 <= n <= 10^5", "0 <= height[i] <= 10^4"],
            "starter_code": {"python": "def maxArea(height: list[int]) -> int:\n    pass", "javascript": "function maxArea(height) {\n    \n}"},
            "difficulty": "medium",
        },
        "Hashing": {
            "title": "Two Sum",
            "description": "Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target. Each input has exactly one solution and you may not use the same element twice.",
            "examples": [{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "nums[0] + nums[1] == 9."}],
            "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Only one valid answer exists."],
            "starter_code": {"python": "def twoSum(nums: list[int], target: int) -> list[int]:\n    pass", "javascript": "function twoSum(nums, target) {\n    \n}"},
            "difficulty": "easy",
        },
        "Arrays": {
            "title": "Best Time to Buy and Sell Stock",
            "description": "You are given an array prices where prices[i] is the price of a stock on day i. Choose a single day to buy and a different later day to sell to maximise profit. Return the maximum profit, or 0 if no profit is possible.",
            "examples": [{"input": "prices = [7,1,5,3,6,4]", "output": "5", "explanation": "Buy on day 2 (price 1), sell on day 5 (price 6)."}],
            "constraints": ["1 <= prices.length <= 10^5", "0 <= prices[i] <= 10^4"],
            "starter_code": {"python": "def maxProfit(prices: list[int]) -> int:\n    pass", "javascript": "function maxProfit(prices) {\n    \n}"},
            "difficulty": "easy",
        },
        "Sliding Window": {
            "title": "Longest Substring Without Repeating Characters",
            "description": "Given a string s, find the length of the longest substring without repeating characters.",
            "examples": [{"input": "s = \"abcabcbb\"", "output": "3", "explanation": "The answer is \"abc\"."}],
            "constraints": ["0 <= s.length <= 5 * 10^4", "s consists of English letters, digits, symbols and spaces."],
            "starter_code": {"python": "def lengthOfLongestSubstring(s: str) -> int:\n    pass", "javascript": "function lengthOfLongestSubstring(s) {\n    \n}"},
            "difficulty": "medium",
        },
        "Binary Search": {
            "title": "Search in Rotated Sorted Array",
            "description": "Given a sorted array nums rotated at an unknown pivot and an integer target, return the index of target or -1. You must write an algorithm with O(log n) runtime.",
            "examples": [{"input": "nums = [4,5,6,7,0,1,2], target = 0", "output": "4", "explanation": "0 is at index 4."}],
            "constraints": ["1 <= nums.length <= 5000", "All values of nums are unique."],
            "starter_code": {"python": "def search(nums: list[int], target: int) -> int:\n    pass", "javascript": "function search(nums, target) {\n    \n}"},
            "difficulty": "medium",
        },
        "Graphs": {
            "title": "Number of Islands",
            "description": "Given an m x n 2D binary grid of '1's (land) and '0's (water), return the number of islands. An island is formed by connecting adjacent lands horizontally or vertically.",
            "examples": [{"input": "grid = [[\"1\",\"1\",\"0\"],[\"1\",\"0\",\"0\"],[\"0\",\"0\",\"1\"]]", "output": "2", "explanation": "Two connected components of '1's."}],
            "constraints": ["1 <= m, n <= 300", "grid[i][j] is '0' or '1'."],
            "starter_code": {"python": "def numIslands(grid: list[list[str]]) -> int:\n    pass", "javascript": "function numIslands(grid) {\n    \n}"},
            "difficulty": "medium",
        },
        "Dynamic Programming": {
            "title": "Coin Change",
            "description": "Given coins of different denominations and a total amount, return the fewest number of coins needed to make up that amount, or -1 if impossible. You have an infinite number of each coin.",
            "examples": [{"input": "coins = [1,2,5], amount = 11", "output": "3", "explanation": "11 = 5 + 5 + 1"}],
            "constraints": ["1 <= coins.length <= 12", "0 <= amount <= 10^4"],
            "starter_code": {"python": "def coinChange(coins: list[int], amount: int) -> int:\n    pass", "javascript": "function coinChange(coins, amount) {\n    \n}"},
            "difficulty": "hard",
        },
        "Intervals": {
            "title": "Merge Intervals",
            "description": "Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals and return the non-overlapping intervals that cover all the input intervals.",
            "examples": [{"input": "intervals = [[1,3],[2,6],[8,10],[15,18]]", "output": "[[1,6],[8,10],[15,18]]", "explanation": "[1,3] and [2,6] overlap."}],
            "constraints": ["1 <= intervals.length <= 10^4", "0 <= start_i <= end_i <= 10^4"],
            "starter_code": {"python": "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    pass", "javascript": "function merge(intervals) {\n    \n}"},
            "difficulty": "medium",
        },
        "Backtracking": {
            "title": "Subsets",
            "description": "Given an integer array nums of unique elements, return all possible subsets (the power set) in any order.",
            "examples": [{"input": "nums = [1,2,3]", "output": "[[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]", "explanation": "All 2^3 subsets."}],
            "constraints": ["1 <= nums.length <= 10", "All numbers are unique."],
            "starter_code": {"python": "def subsets(nums: list[int]) -> list[list[int]]:\n    pass", "javascript": "function subsets(nums) {\n    \n}"},
            "difficulty": "hard",
        },
    }

    def _get_fallback_problem(self, difficulty: str, pattern: str, asked_titles: list[str] | None = None) -> dict:
        asked = set(asked_titles or [])
        candidates = [dict(p) for name, p in self.PROBLEM_BANK.items() if (name == pattern and p["title"] not in asked)]
        if not candidates:
            candidates = [dict(p) for p in self.PROBLEM_BANK.values() if p["title"] not in asked and p["difficulty"] == difficulty]
        if not candidates:
            candidates = [dict(p) for p in self.PROBLEM_BANK.values() if p["title"] not in asked] or [dict(self.PROBLEM_BANK["Intervals"])]
        prob = candidates[0]
        prob["pattern"] = next((n for n, p in self.PROBLEM_BANK.items() if p["title"] == prob["title"]), pattern)
        prob["requested_difficulty"] = difficulty
        prob["concept_question"] = "What is the time and space complexity of your solution, and could it be improved?"
        return prob

    @staticmethod
    def _unscored_evaluation(problem: dict, submitted_code: str, hints_used: int) -> dict:
        code = (submitted_code or "").strip()
        is_placeholder = len(code) < 40 or code.endswith("pass") or "pass" == code.splitlines()[-1].strip() if code else True
        return {
            "correct": None,
            "time_complexity": None,
            "space_complexity": None,
            "edge_cases_handled": [],
            "edge_cases_missed": [],
            "code_quality_notes": "Not evaluated: the AI evaluator was unavailable." + (
                " The submission looks like placeholder/starter code." if is_placeholder else ""),
            "approach_score": None,
            "correctness_score": None,
            "complexity_score": None,
            "communication_score": None,
            "overall_score": None,
            "feedback": "This submission could not be evaluated automatically because the AI evaluator was unavailable. "
                        "It has been recorded and can be re-evaluated later.",
            "evaluation_source": "unavailable",
            "hints_used": hints_used,
            "problem_title": problem.get("title"),
            "difficulty": problem.get("difficulty"),
            "pattern": problem.get("pattern"),
            "code_length": len(code),
        }
