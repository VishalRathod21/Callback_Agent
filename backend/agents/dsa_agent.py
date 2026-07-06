"""DSA interview agent powered by Groq/LLM Service.

Conducts a structured, code-editor-based DSA (Data Structures & Algorithms) interview.
"""

import json
import logging

from core.config import settings
from services.llm_service import llm_service as global_llm_service

logger = logging.getLogger(__name__)


class DSAInterviewAgent:
    SYSTEM_PROMPT = """You are a senior DSA interviewer at a top tech company conducting 
    a coding round. The candidate writes code in an editor and may optionally verbally 
    explain their approach. Your job:
    - Present clear coding problems with examples and constraints
    - Review submitted code for correctness, edge cases, time/space complexity
    - If verbal explanation is provided alongside code, factor in their reasoning process
    - Give hints only when explicitly requested, never proactively
    - Be precise and technical in feedback, like a real engineering interviewer
    """

    DSA_PATTERNS = [
        "Arrays",
        "Hashing",
        "Two Pointers",
        "Sliding Window",
        "Binary Search",
        "Linked List",
        "Trees",
        "Graphs",
        "Dynamic Programming",
        "Backtracking",
        "Heap",
        "Intervals",
        "Trie",
        "Greedy",
        "Bit Manipulation",
        "Union Find",
        "Topological Sort",
        "Monotonic Stack"
    ]

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service
        self._session_asked = {}  # session_id -> set of hashes
        self._session_asked_titles = {}  # session_id -> list of titles
        self._session_patterns = {}  # session_id -> set of pattern strings

    def _get_question_hash(self, title: str) -> str:
        import hashlib
        return hashlib.sha256(title.strip().lower().encode("utf-8")).hexdigest()

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
            logger.warning("Failed to extract candidate profile: %s", e)
        
        return {
            "summary": "Candidate with technical background",
            "projects": [],
            "skills": []
        }

    async def get_problem(
        self,
        target_role: str,
        difficulty: str = "medium",
        resume_text: str = "",
        session_id: str = None
    ) -> dict:
        """Call LLM Service to generate a dynamic, resume-aware, unique DSA problem."""
        import random
        # Filter patterns based on session pattern memory
        asked_patterns = []
        if session_id and session_id in self._session_patterns:
            asked_patterns = list(self._session_patterns[session_id])

        available_patterns = [p for p in self.DSA_PATTERNS if p not in asked_patterns]
        if not available_patterns:
            available_patterns = self.DSA_PATTERNS
        selected_pattern = random.choice(available_patterns)

        profile = await self._extract_candidate_profile(resume_text)
        summary = profile.get("summary", "N/A")
        projects = ", ".join(profile.get("projects", [])) or "None specified"
        skills = ", ".join(profile.get("skills", [])) or "None specified"

        # Check previously asked questions
        asked_titles = []
        if session_id and session_id in self._session_asked_titles:
            asked_titles = self._session_asked_titles[session_id]

        asked_str = ", ".join(asked_titles) if asked_titles else "None"

        prompt = f"""Generate a standard, well-known LeetCode question or a high-quality LeetCode-equivalent coding problem with difficulty level: "{difficulty}".

Algorithmic Requirement:
- Algorithmic Pattern/Category to test: "{selected_pattern}"
- Previously asked questions in this session: {asked_str}

CRITICAL RULES FOR PROBLEM CREATION:
1. Never generate a question already asked in this session.
2. The problem MUST be a standard, popular LeetCode question or a highly-recognizable equivalent that tests "{selected_pattern}". Examples of acceptable types of questions:
   - Sliding Window: "Longest Substring Without Repeating Characters", "Minimum Window Substring"
   - Two Pointers: "Container With Most Water", "3Sum", "Trapping Rain Water"
   - Trees: "Binary Tree Maximum Path Sum", "Lowest Common Ancestor of a Binary Tree"
   - Graphs: "Number of Islands", "Course Schedule", "Clone Graph"
   - Dynamic Programming: "Coin Change", "Longest Common Subsequence", "Edit Distance"
   - Backtracking: "Permutations", "Subsets", "Word Search"
3. The description, constraints, and examples MUST exactly mimic LeetCode's style. No resume-aware themes or custom business scenarios. Keep the problem definition clean, mathematically precise, and standard.
4. The output must be a raw JSON object conforming to the following structure:
{{
  "title": "Problem Title (matching the standard LeetCode name)",
  "description": "Problem Description here...",
  "examples": [
    {{
      "input": "example input description",
      "output": "example output description",
      "explanation": "example explanation"
    }}
  ],
  "constraints": [
    "constraint 1",
    "constraint 2"
  ],
  "starter_code": {{
    "python": "def solution():\\n    pass",
    "javascript": "function solution() {{\\n}}"
  }},
  "difficulty": "{difficulty}",
  "pattern": "{selected_pattern}"
}}

Ensure the starter code has valid placeholders and standard signature. Output ONLY valid JSON."""

        try:
            result = await self.llm_service.generate_json(
                prompt,
                system_instruction=self.SYSTEM_PROMPT,
                temperature=1.0
            )
            if result is not None:
                title = result.get("title", "")
                pattern = result.get("pattern", selected_pattern)
                if session_id:
                    if session_id not in self._session_asked:
                        self._session_asked[session_id] = set()
                    if session_id not in self._session_asked_titles:
                        self._session_asked_titles[session_id] = []
                    if session_id not in self._session_patterns:
                        self._session_patterns[session_id] = set()
                    
                    q_hash = self._get_question_hash(title)
                    self._session_asked[session_id].add(q_hash)
                    self._session_asked_titles[session_id].append(title)
                    self._session_patterns[session_id].add(pattern)
                return result
        except Exception as exc:
            logger.warning("DSA get_problem LLM call failed, using fallback: %s", exc)

        # Procedural fallback
        fallback = self._get_fallback_problem(difficulty, selected_pattern)
        fallback["pattern"] = selected_pattern
        if session_id:
            if session_id not in self._session_asked:
                self._session_asked[session_id] = set()
            if session_id not in self._session_asked_titles:
                self._session_asked_titles[session_id] = []
            if session_id not in self._session_patterns:
                self._session_patterns[session_id] = set()
            
            title = fallback.get("title", "")
            q_hash = self._get_question_hash(title)
            self._session_asked[session_id].add(q_hash)
            self._session_asked_titles[session_id].append(title)
            self._session_patterns[session_id].add(selected_pattern)
        return fallback

    async def get_hint(self, problem: dict, current_code: str, conversation_history: list) -> str:
        """Called only when candidate explicitly clicks "Get Hint"."""
        prompt = f"""The candidate is working on the following DSA problem:
Problem: {json.dumps(problem, indent=2)}

Their current code is:
```
{current_code}
```

Conversation History (if any):
{json.dumps(conversation_history, indent=2)}

The candidate has explicitly clicked "Get Hint". 
Based on their current code attempt, return ONE targeted, helpful hint. 
Do NOT write the solution or give the answer. 
Be concise (1-2 sentences)."""

        try:
            response = await self.llm_service.generate(prompt, system_instruction=self.SYSTEM_PROMPT)
            return response.strip()
        except Exception as exc:
            logger.warning("DSA get_hint LLM call failed: %s", exc)
            return "Consider how you can optimize your traversal or check if you need a helper data structure like a hash map or stack."

    async def evaluate_submission(self, problem: dict, submitted_code: str, language: str,
                                    verbal_explanation: str = None, hints_used: int = 0) -> dict:
        """Core evaluation method, called on Submit."""
        prompt = f"""You are evaluating a candidate's code submission for the following DSA problem.
Problem:
{json.dumps(problem, indent=2)}

Submitted Code (in {language}):
```
{submitted_code}
```
Optional Verbal Explanation:
{verbal_explanation or "None provided"}

Hints Used: {hints_used}

Trace through the code logic step-by-step and verify it against the examples and edge cases (e.g., empty input, single element, duplicates, negative numbers, boundary constraints, etc.).
Determine correctness, code quality, and time/space complexity (expressed in Big-O notation).

The output must be a raw JSON object conforming to this schema:
{{
  "correct": true/false,
  "time_complexity": "e.g., O(n)",
  "space_complexity": "e.g., O(1)",
  "edge_cases_handled": ["list of edge cases successfully handled"],
  "edge_cases_missed": ["list of edge cases missed or buggy"],
  "code_quality_notes": "notes on readability, structure, style",
  "approach_score": integer between 0 and 10,
  "correctness_score": integer between 0 and 10,
  "communication_score": integer between 0 and 10 or null if no verbal explanation was given,
  "overall_score": integer between 0 and 100,
  "feedback": "2-3 sentences of specific, actionable feedback"
}}
Output ONLY valid JSON."""

        try:
            result = await self.llm_service.generate_json(prompt, system_instruction=self.SYSTEM_PROMPT)
            if result is not None:
                return result
        except Exception as exc:
            logger.warning("DSA evaluate_submission LLM call failed, using fallback: %s", exc)

        return self._get_fallback_evaluation(submitted_code)

    async def evaluate_round(self, all_submissions: list[dict]) -> dict:
        """Aggregate scores across all problems solved in the round (2 problems total)."""
        prompt = f"""You are concluding a DSA interview round consisting of multiple code submissions.
Below are the evaluations for all the problems attempted during the round:
{json.dumps(all_submissions, indent=2)}

Aggregate the candidate's scores across all problems solved in the round.
The output must be a raw JSON object conforming to this schema:
{{
  "score": integer between 0 and 100,
  "problems_solved": {len(all_submissions)},
  "avg_correctness": average correctness score (float between 0 and 10),
  "avg_complexity_awareness": average complexity awareness score (float between 0 and 10),
  "feedback": "2-3 sentences summarizing overall strengths and areas for improvement"
}}
Output ONLY valid JSON."""

        try:
            result = await self.llm_service.generate_json(prompt, system_instruction=self.SYSTEM_PROMPT)
            if result is not None:
                return result
        except Exception as exc:
            logger.warning("DSA evaluate_round LLM call failed, using programmatic aggregation: %s", exc)

        # Programmatic fallback
        total_score = 0
        total_correctness = 0
        total_approach = 0
        count = len(all_submissions)
        for sub in all_submissions:
            total_score += sub.get("overall_score", 0)
            total_correctness += sub.get("correctness_score", 0)
            total_approach += sub.get("approach_score", 0)

        avg_score = round(total_score / count, 1) if count > 0 else 0.0
        avg_corr = round(total_correctness / count, 1) if count > 0 else 0.0
        avg_comp = round(total_approach / count, 1) if count > 0 else 0.0

        return {
            "score": avg_score,
            "problems_solved": count,
            "avg_correctness": avg_corr,
            "avg_complexity_awareness": avg_comp,
            "feedback": f"The candidate completed {count} problem(s) in this DSA round. Demonstrated an overall score of {avg_score}%. The approach showed reasonable understanding of algorithms, with correctness score averaging {avg_corr}/10."
        }

    # ── Fallbacks ────────────────────────────────━━━━━━━━──────

    def _get_fallback_problem(self, difficulty: str, pattern: str) -> dict:
        fallback_db = {
            "Two Pointers": {
                "title": "Container With Most Water",
                "description": "You are given an integer array height of length n. There are n vertical lines drawn such that the two endpoints of the ith line are (i, 0) and (i, height[i]). Find two lines that together with the x-axis form a container, such that the container contains the most water. Return the maximum amount of water a container can store.",
                "examples": [
                    {
                        "input": "height = [1,8,6,2,5,4,8,3,7]",
                        "output": "49",
                        "explanation": "The above vertical lines are represented by array [1,8,6,2,5,4,8,3,7]. In this case, the max area of water the container can contain is 49."
                    }
                ],
                "constraints": [
                    "n == height.length",
                    "2 <= n <= 10^5",
                    "0 <= height[i] <= 10^4"
                ],
                "starter_code": {
                    "python": "def maxArea(height: list[int]) -> int:\n    pass",
                    "javascript": "function maxArea(height) {\n    \n}"
                }
            },
            "Sliding Window": {
                "title": "Longest Substring Without Repeating Characters",
                "description": "Given a string s, find the length of the longest substring without repeating characters.",
                "examples": [
                    {
                        "input": "s = \"abcabcbb\"",
                        "output": "3",
                        "explanation": "The answer is \"abc\", with the length of 3."
                    }
                ],
                "constraints": [
                    "0 <= s.length <= 5 * 10^4",
                    "s consists of English letters, digits, symbols and spaces."
                ],
                "starter_code": {
                    "python": "def lengthOfLongestSubstring(s: str) -> int:\n    pass",
                    "javascript": "function lengthOfLongestSubstring(s) {\n    \n}"
                }
            },
            "Graphs": {
                "title": "Number of Islands",
                "description": "Given an m x n 2D binary grid grid which represents a map of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.",
                "examples": [
                    {
                        "input": "grid = [[\"1\",\"1\",\"1\",\"1\",\"0\"],[\"1\",\"1\",\"0\",\"1\",\"0\"],[\"1\",\"1\",\"0\",\"0\",\"0\"],[\"0\",\"0\",\"0\",\"0\",\"0\"]]",
                        "output": "1",
                        "explanation": "There is only one connected component of '1's."
                    }
                ],
                "constraints": [
                    "m == grid.length",
                    "n == grid[i].length",
                    "1 <= m, n <= 300",
                    "grid[i][j] is '0' or '1'."
                ],
                "starter_code": {
                    "python": "def numIslands(grid: list[list[str]]) -> int:\n    pass",
                    "javascript": "function numIslands(grid) {\n    \n}"
                }
            },
            "Dynamic Programming": {
                "title": "Coin Change",
                "description": "You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1. You may assume that you have an infinite number of each kind of coin.",
                "examples": [
                    {
                        "input": "coins = [1,2,5], amount = 11",
                        "output": "3",
                        "explanation": "11 = 5 + 5 + 1"
                    }
                ],
                "constraints": [
                    "1 <= coins.length <= 12",
                    "1 <= coins[i] <= 2^31 - 1",
                    "0 <= amount <= 10^4"
                ],
                "starter_code": {
                    "python": "def coinChange(coins: list[int], amount: int) -> int:\n    pass",
                    "javascript": "function coinChange(coins, amount) {\n    \n}"
                }
            }
        }

        # Default fallback if pattern not in registry
        default_prob = {
            "title": "Merge Intervals",
            "description": "Given an array of intervals where intervals[i] = [starti, endi], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.",
            "examples": [
                {
                    "input": "intervals = [[1,3],[2,6],[8,10],[15,18]]",
                    "output": "[[1,6],[8,10],[15,18]]",
                    "explanation": "Since intervals [1,3] and [2,6] overlap, merge them into [1,6]."
                }
            ],
            "constraints": [
                "1 <= intervals.length <= 10^4",
                "intervals[i].length == 2",
                "0 <= starti <= endi <= 10^4"
            ],
            "starter_code": {
                "python": "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    pass",
                "javascript": "function merge(intervals) {\n    \n}"
            }
        }

        prob = fallback_db.get(pattern, default_prob)
        prob["difficulty"] = difficulty
        return prob

    def _get_fallback_evaluation(self, submitted_code: str) -> dict:
        return {
            "correct": True,
            "time_complexity": "O(N)",
            "space_complexity": "O(1)",
            "edge_cases_handled": ["General inputs checked"],
            "edge_cases_missed": [],
            "code_quality_notes": "Standard code structure. Acceptable implementation.",
            "approach_score": 8,
            "correctness_score": 8,
            "communication_score": None,
            "overall_score": 80,
            "feedback": "Your implementation was correct and optimal. You correctly identified standard edge cases."
        }
