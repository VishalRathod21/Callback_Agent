"""Report generation agent.

Collects everything persisted for a session (candidate profile, configuration,
round transcripts, per-question rubric evaluations, difficulty trace) into a
single structured ``report_data`` dict, enriches it with an LLM narrative when
available, and renders a PDF with ReportLab.

The narrative source is always recorded (``narrative_source``: "llm" |
"fallback") and heuristic/unavailable evaluations are surfaced, never hidden.
"""

from __future__ import annotations

import logging
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)
from reportlab.graphics.shapes import Drawing, Rect, String

from core.config import settings
from core.timeutil import seconds_between
from core.models import Candidate, InterviewSession, RoundTranscript, InterviewQuestion
from services.llm_service import llm_service as global_llm_service, LLMUnavailableError

logger = logging.getLogger(__name__)

RUBRIC_KEYS = ["technical_correctness", "conceptual_understanding", "answer_completeness", "communication_clarity"]
RUBRIC_LABELS = {
    "technical_correctness": "Technical correctness",
    "conceptual_understanding": "Conceptual understanding",
    "answer_completeness": "Answer completeness",
    "communication_clarity": "Communication clarity",
}

_SYSTEM_PROMPT = """\
You are an expert talent partner writing a candidate's mock-interview debrief.
Base every statement strictly on the provided evaluations, transcripts and scores. Do not invent facts.
Return ONLY a JSON object:
{
  "executive_summary": "<3 sentences: overall performance, strongest area, main gap>",
  "strengths": ["<specific strength with evidence>", "<...>", "<...>"],
  "weaknesses": ["<specific gap with evidence>", "<...>", "<...>"],
  "recommendations": ["<actionable step>", "<...>", "<...>"],
  "learning_topics": ["<topic>", "<...>"],
  "final_recommendation": "hire" | "maybe" | "no_hire"
}
"""


def _pct(v: float | None) -> str:
    return "—" if v is None else f"{v:.1f}%"


def _score10(v: float | None) -> str:
    return "—" if v is None else f"{v:.1f}/10"


class ReportAgent:
    """Builds the final structured report and renders it to PDF."""

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service

    # ── Structured report data ─────────────────────────────────────────────
    def build_report_data(
        self,
        candidate: Candidate,
        session: InterviewSession,
        transcripts: list[RoundTranscript],
        questions: list[InterviewQuestion],
        narrative: dict | None = None,
        narrative_source: str = "fallback",
    ) -> dict:
        cfg = session.config or {}
        rounds_cfg = cfg.get("rounds") or ["dsa", "technical", "hr"]
        round_scores = dict(session.round_scores or {})
        for t in transcripts:
            if t.round_name not in round_scores and t.score is not None:
                round_scores[t.round_name] = t.score

        duration_s = session.duration_seconds
        if duration_s is None:
            duration_s = seconds_between(session.started_at, session.ended_at)

        # Per-question breakdown
        q_items = []
        by_round: dict[str, list[InterviewQuestion]] = defaultdict(list)
        for q in sorted(questions, key=lambda x: (x.round_name, x.question_index)):
            by_round[q.round_name].append(q)
            ev = q.evaluation or {}
            q_items.append({
                "round": q.round_name,
                "index": q.question_index,
                "category": q.category,
                "difficulty": q.difficulty,
                "next_difficulty": q.next_difficulty,
                "is_follow_up": q.is_follow_up,
                "question": q.question_text,
                "answer": q.answer_text,
                "scores": {k: getattr(q, k) for k in RUBRIC_KEYS},
                "overall_score": q.overall_score,
                "feedback": ev.get("feedback"),
                "strengths": ev.get("strengths", []),
                "gaps": ev.get("gaps", []),
                "ideal_answer_points": ev.get("ideal_answer_points", []),
                "learning_topics": ev.get("learning_topics", []),
                "evaluation_source": q.evaluation_source,
                "generation_source": q.generation_source,
                "retrieval_sources": q.retrieval_sources or [],
                "generation_latency_ms": q.generation_latency_ms,
                "evaluation_latency_ms": q.evaluation_latency_ms,
            })

        # Rubric averages (all evaluated questions)
        evaluated = [q for q in questions if q.overall_score is not None]
        rubric_avg = {}
        for k in RUBRIC_KEYS:
            vals = [getattr(q, k) for q in evaluated if getattr(q, k) is not None]
            rubric_avg[k] = round(sum(vals) / len(vals), 2) if vals else None

        # Skill-wise (category) performance
        skill_perf = {}
        for cat, items in self._group(evaluated, lambda q: q.category or "general").items():
            vals = [q.overall_score for q in items]
            skill_perf[cat] = {"questions": len(items), "average": round(sum(vals) / len(vals), 2)}

        # Difficulty trace
        difficulty_trace = [
            {"round": q.round_name, "index": q.question_index, "difficulty": q.difficulty,
             "score": q.overall_score, "next_difficulty": q.next_difficulty}
            for q in sorted(evaluated, key=lambda x: (rounds_cfg.index(x.round_name) if x.round_name in rounds_cfg else 9, x.question_index))
        ]

        # Round summaries
        rounds = []
        for rnd in rounds_cfg:
            t = next((x for x in transcripts if x.round_name == rnd and not (x.transcript or "").lstrip().startswith("{")), None)
            ev = (t.ai_evaluation if t else None) or {}
            rq = by_round.get(rnd, [])
            rounds.append({
                "name": rnd,
                "score": round_scores.get(rnd),
                "questions": len(rq),
                "evaluation_source": ev.get("evaluation_source", "llm" if t else None),
                "feedback": ev.get("feedback"),
                "strengths": ev.get("strengths", []),
                "weaknesses": ev.get("weaknesses", []),
                "learning_topics": ev.get("learning_topics", []),
                "rubric_averages": ev.get("rubric_averages"),
                "communication_analysis": ev.get("communication_analysis"),
                "dsa": {k: ev.get(k) for k in ("problems_solved", "problems_attempted", "avg_correctness", "avg_complexity_awareness")} if rnd == "dsa" else None,
                "completed": t is not None or rnd in round_scores,
            })

        # Evaluation provenance summary
        sources = Counter((q.evaluation_source or "unknown") for q in evaluated)
        provenance = {
            "llm": sources.get("llm", 0),
            "heuristic": sources.get("heuristic", 0),
            "unavailable": sources.get("unavailable", 0),
            "note": (
                "All answer scores were produced by the AI evaluator."
                if set(sources) <= {"llm"} and evaluated
                else "Some answers were scored heuristically or not scored because the AI evaluator was unavailable; "
                     "those scores do not certify technical correctness."
            ),
        }

        learning_topics: list[str] = []
        for q in q_items:
            for t in q.get("learning_topics") or []:
                if t not in learning_topics:
                    learning_topics.append(t)
        for r in rounds:
            for t in r.get("learning_topics") or []:
                if t not in learning_topics:
                    learning_topics.append(t)

        if narrative is None:
            narrative = self._fallback_narrative(candidate, session, rounds, rubric_avg, q_items)
            narrative_source = "fallback"
        narrative.setdefault("learning_topics", learning_topics[:8])

        return {
            "report_version": 2,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "narrative_source": narrative_source,
            "candidate": {
                "id": str(candidate.id), "name": candidate.name, "email": candidate.email,
                "target_role": session.target_role or candidate.target_role, "ats_score": candidate.ats_score,
                "skills": (candidate.resume_structured or {}).get("skills", [])[:20],
                "summary": (candidate.resume_structured or {}).get("summary"),
            },
            "session": {
                "id": str(session.id), "status": session.status.value, "mode": session.mode or cfg.get("mode"),
                "config": cfg, "persona": session.persona,
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "duration_seconds": duration_s,
                "total_questions": len(questions),
                "overall_score": session.overall_score,
                "round_scores": round_scores,
            },
            "rounds": rounds,
            "rubric_averages": rubric_avg,
            "skill_performance": skill_perf,
            "difficulty_trace": difficulty_trace,
            "questions": q_items,
            "evaluation_provenance": provenance,
            "narrative": narrative,
            "learning_topics": learning_topics[:10],
        }

    @staticmethod
    def _group(items, key):
        out: dict = defaultdict(list)
        for it in items:
            out[key(it)].append(it)
        return out

    @staticmethod
    def _fallback_narrative(candidate, session, rounds, rubric_avg, q_items) -> dict:
        overall = session.overall_score
        scored_rounds = [r for r in rounds if r.get("score") is not None]
        best = max(scored_rounds, key=lambda r: r["score"]) if scored_rounds else None
        worst = min(scored_rounds, key=lambda r: r["score"]) if scored_rounds else None
        strengths, weaknesses = [], []
        for q in q_items:
            strengths.extend(q.get("strengths") or [])
            weaknesses.extend(q.get("gaps") or [])
        valid_rubric = {k: v for k, v in rubric_avg.items() if v is not None}
        summary = (
            f"{candidate.name} completed {len(scored_rounds)} scored round(s) for the "
            f"{session.target_role or candidate.target_role or 'target'} role"
            + (f" with an overall score of {overall:.1f}%." if overall is not None else ".")
        )
        if best and worst and best is not worst:
            summary += f" Strongest round: {best['name']} ({best['score']:.1f}%); weakest: {worst['name']} ({worst['score']:.1f}%)."
        if valid_rubric:
            lo = min(valid_rubric, key=valid_rubric.get)
            summary += f" The lowest rubric criterion was {RUBRIC_LABELS[lo].lower()} ({valid_rubric[lo]:.1f}/10)."
        rec = "maybe"
        if overall is not None:
            rec = "hire" if overall >= 75 else ("maybe" if overall >= 50 else "no_hire")
        return {
            "executive_summary": summary,
            "strengths": list(dict.fromkeys(strengths))[:3] or ["No evaluator-identified strengths recorded."],
            "weaknesses": list(dict.fromkeys(weaknesses))[:3] or ["No evaluator-identified gaps recorded."],
            "recommendations": [
                f"Practise {RUBRIC_LABELS[min(valid_rubric, key=valid_rubric.get)].lower()} with timed answers."
                if valid_rubric else "Complete a full interview with the AI evaluator enabled for detailed feedback.",
                "Review the question-wise feedback below and re-attempt the lowest-scoring questions.",
            ],
            "final_recommendation": rec,
            "generated_by": "deterministic summary (LLM narrative unavailable)",
        }

    # ── LLM narrative ──────────────────────────────────────────────────────
    async def generate_narrative(self, report_data: dict) -> tuple[dict, str]:
        """Return (narrative, source). Falls back to the deterministic narrative."""
        if not getattr(self.llm_service, "available", True):
            return report_data["narrative"], "fallback"
        condensed = {
            "candidate": report_data["candidate"]["name"],
            "target_role": report_data["candidate"]["target_role"],
            "overall_score": report_data["session"]["overall_score"],
            "round_scores": report_data["session"]["round_scores"],
            "rubric_averages": report_data["rubric_averages"],
            "skill_performance": report_data["skill_performance"],
            "questions": [
                {"round": q["round"], "difficulty": q["difficulty"], "question": q["question"][:300],
                 "answer": (q["answer"] or "")[:500], "overall_score": q["overall_score"],
                 "feedback": q["feedback"], "gaps": q["gaps"], "evaluation_source": q["evaluation_source"]}
                for q in report_data["questions"][:24]
            ],
            "evaluation_provenance": report_data["evaluation_provenance"],
        }
        import json
        try:
            result = await self.llm_service.generate_json(json.dumps(condensed, indent=1)[:14000],
                                                          system_instruction=_SYSTEM_PROMPT, temperature=0.3)
            if result and result.get("executive_summary"):
                for key in ("strengths", "weaknesses", "recommendations", "learning_topics"):
                    val = result.get(key) or []
                    result[key] = [str(v) for v in (val if isinstance(val, list) else [val])][:6]
                if result.get("final_recommendation") not in ("hire", "maybe", "no_hire"):
                    result["final_recommendation"] = report_data["narrative"].get("final_recommendation", "maybe")
                return result, "llm"
        except LLMUnavailableError:
            pass
        except Exception as exc:  # noqa: BLE001
            logger.warning("Report narrative generation failed: %s", exc)
        return report_data["narrative"], "fallback"

    async def _generate_narrative_summary(self, candidate, session, transcripts) -> dict:
        """Legacy entry point kept for compatibility with older callers/tests."""
        data = self.build_report_data(candidate, session, transcripts, [])
        narrative, source = await self.generate_narrative(data)
        if source != "llm":
            raise ValueError("LLM narrative unavailable")
        return narrative

    # ── Orchestration ──────────────────────────────────────────────────────
    async def generate_report(self, candidate, session, transcripts, questions: list | None = None) -> tuple[str, bool]:
        """Build report data, render PDF, return (pdf_path, is_fallback_narrative)."""
        data = self.build_report_data(candidate, session, transcripts, questions or [])
        narrative, source = await self.generate_narrative(data)
        data["narrative"], data["narrative_source"] = narrative, source
        pdf_path = self.pdf_path_for(candidate, session)
        await self.render_pdf(pdf_path, data)
        return pdf_path, source != "llm"

    @staticmethod
    def pdf_path_for(candidate, session) -> str:
        candidate_dir = os.path.join(settings.UPLOAD_DIR, str(candidate.id))
        os.makedirs(candidate_dir, exist_ok=True)
        return os.path.join(candidate_dir, f"report_{session.id}.pdf")

    # ── PDF rendering ──────────────────────────────────────────────────────
    async def render_pdf(self, dest_path: str, data: dict) -> None:
        import asyncio
        await asyncio.to_thread(self._render_pdf_sync, dest_path, data)

    def _render_pdf_sync(self, dest_path: str, data: dict) -> None:
        doc = SimpleDocTemplate(dest_path, pagesize=A4, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=48,
                                title="Interview Evaluation Report", author="Callback Rehearsal · InterviewAI")
        styles = getSampleStyleSheet()
        ink, muted, accent = "#18181B", "#52525B", "#6D28D9"
        title = ParagraphStyle("T", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=colors.HexColor(ink), spaceAfter=4)
        sub = ParagraphStyle("S", parent=styles["Normal"], fontName="Helvetica", fontSize=11, leading=15, textColor=colors.HexColor(muted), spaceAfter=14)
        h1 = ParagraphStyle("H1", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor(ink), spaceBefore=16, spaceAfter=8, keepWithNext=True)
        h2 = ParagraphStyle("H2", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor(accent), spaceBefore=10, spaceAfter=4, keepWithNext=True)
        body = ParagraphStyle("B", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor(ink), spaceAfter=5)
        small = ParagraphStyle("Sm", parent=body, fontSize=8.5, leading=12, textColor=colors.HexColor(muted))
        bullet = ParagraphStyle("Bu", parent=body, leftIndent=12, spaceAfter=3)

        def esc(s) -> str:
            return (str(s) if s is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        def table(rows, col_widths, header=True):
            t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
            style = [
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor(ink)),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#E4E4E7")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            if header:
                style += [("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4F4F5"))]
            t.setStyle(TableStyle(style))
            return t

        c, s, n = data["candidate"], data["session"], data["narrative"]
        story = []

        # Cover
        story.append(Paragraph("Callback Rehearsal · InterviewAI", ParagraphStyle("Brand", parent=small, textColor=colors.HexColor(accent), fontName="Helvetica-Bold")))
        story.append(Paragraph("Interview Evaluation Report", title))
        story.append(Paragraph(f"{esc(c['name'])} · {esc(c['target_role'] or 'Target role not set')}", sub))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E4E4E7"), spaceAfter=12))

        dur = s.get("duration_seconds")
        dur_txt = f"{dur // 60} min {dur % 60} s" if dur is not None else "—"
        meta = [
            ["Interview date", (s.get("started_at") or "")[:10] or "—", "Mode", esc(s.get("mode") or "text")],
            ["Duration", dur_txt, "Questions", str(s.get("total_questions", 0))],
            ["Rounds", ", ".join(r["name"].upper() for r in data["rounds"]), "Difficulty start", esc((s.get("config") or {}).get("difficulty", "medium"))],
            ["Adaptive difficulty", "on" if (s.get("config") or {}).get("adaptive", True) else "off", "ATS resume match", _pct(c.get("ats_score"))],
        ]
        story.append(table(meta, [100, 150, 100, 150], header=False))
        story.append(Spacer(1, 14))

        overall = s.get("overall_score")
        color = "#15803D" if (overall or 0) >= 75 else ("#B45309" if (overall or 0) >= 50 else "#B91C1C")
        box = Table([[Paragraph("OVERALL INTERVIEW SCORE", ParagraphStyle("st", parent=small, alignment=1))],
                     [Paragraph(_pct(overall), ParagraphStyle("sn", parent=title, fontSize=40, leading=44, alignment=1, textColor=colors.HexColor(color)))]],
                    colWidths=[500])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFAFA")), ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E4E4E7")), ("PADDING", (0, 0), (-1, -1), 14)]))
        story.append(box)
        story.append(Spacer(1, 14))

        story.append(Paragraph("Performance by round", h1))
        rows = [["Round", "Score", "Questions", "Evaluation source"]]
        for r in data["rounds"]:
            rows.append([r["name"].upper(), _pct(r.get("score")), str(r.get("questions", 0)), esc(r.get("evaluation_source") or "—")])
        story.append(table(rows, [120, 100, 100, 180]))
        story.append(Spacer(1, 8))

        drawing = Drawing(500, 28 * max(1, len(data["rounds"])))
        y = drawing.height - 22
        for r in data["rounds"]:
            sc = r.get("score") or 0.0
            drawing.add(String(0, y + 3, r["name"].upper(), fontName="Helvetica-Bold", fontSize=8, fillColor=colors.HexColor(muted)))
            drawing.add(Rect(90, y, 330, 10, fillColor=colors.HexColor("#F4F4F5"), strokeColor=None))
            drawing.add(Rect(90, y, 3.3 * sc, 10, fillColor=colors.HexColor("#15803D" if sc >= 75 else "#B45309" if sc >= 50 else "#B91C1C"), strokeColor=None))
            drawing.add(String(428, y + 2, _pct(r.get("score")), fontName="Helvetica", fontSize=8, fillColor=colors.HexColor(ink)))
            y -= 28
        story.append(drawing)

        story.append(Paragraph("Rubric averages (all evaluated answers)", h1))
        rows = [["Criterion", "Weight", "Average"]]
        weights = settings.rubric_weights
        for k in RUBRIC_KEYS:
            rows.append([RUBRIC_LABELS[k], f"{weights[k]:.0%}", _score10(data["rubric_averages"].get(k))])
        story.append(table(rows, [220, 100, 100]))
        story.append(Spacer(1, 6))
        story.append(Paragraph(esc(data["evaluation_provenance"]["note"]), small))
        story.append(PageBreak())

        # Narrative
        story.append(Paragraph("Evaluation summary", title))
        story.append(Paragraph(f"Narrative source: {esc(data.get('narrative_source', 'fallback'))}", small))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E4E4E7"), spaceAfter=10))
        story.append(Paragraph("Executive summary", h1))
        story.append(Paragraph(esc(n.get("executive_summary", "")), body))
        for label, key in (("Strengths", "strengths"), ("Areas for development", "weaknesses"), ("Recommendations", "recommendations")):
            story.append(Paragraph(label, h1))
            for item in n.get(key, []) or []:
                story.append(Paragraph(f"• {esc(item)}", bullet))
        topics = data.get("learning_topics") or n.get("learning_topics") or []
        if topics:
            story.append(Paragraph("Suggested learning topics", h1))
            story.append(Paragraph(", ".join(esc(t) for t in topics), body))
        story.append(Paragraph("Recommendation", h1))
        rec = (n.get("final_recommendation") or "maybe").replace("_", " ").upper()
        story.append(Paragraph(f"<b>{esc(rec)}</b>", body))

        if data.get("skill_performance"):
            story.append(Paragraph("Skill-wise performance", h1))
            rows = [["Category", "Questions", "Average (0-10)"]]
            for cat, v in sorted(data["skill_performance"].items(), key=lambda kv: -kv[1]["average"]):
                rows.append([esc(cat.replace("_", " ")), str(v["questions"]), f"{v['average']:.1f}"])
            story.append(table(rows, [220, 100, 120]))

        if data.get("difficulty_trace"):
            story.append(Paragraph("Adaptive difficulty trace", h1))
            rows = [["Round", "#", "Difficulty", "Score", "Next"]]
            for d in data["difficulty_trace"]:
                rows.append([d["round"], str(d["index"] + 1), esc(d["difficulty"]), _score10(d["score"]), esc(d["next_difficulty"])])
            story.append(table(rows, [90, 40, 100, 90, 100]))
        story.append(PageBreak())

        # Question-wise feedback
        story.append(Paragraph("Question-wise feedback", title))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E4E4E7"), spaceAfter=10))
        for q in data["questions"]:
            story.append(Paragraph(
                f"{q['round'].upper()} · Q{q['index'] + 1} · {esc((q.get('category') or 'general').replace('_', ' '))} · "
                f"{esc(q.get('difficulty'))} · {_score10(q.get('overall_score'))} · source: {esc(q.get('evaluation_source') or '—')}", h2))
            story.append(Paragraph(f"<b>Question.</b> {esc(q['question'])}", body))
            story.append(Paragraph(f"<b>Answer.</b> {esc((q.get('answer') or '(no answer)')[:1500])}", body))
            sc = q.get("scores") or {}
            story.append(Paragraph(" · ".join(f"{RUBRIC_LABELS[k]}: {_score10(sc.get(k))}" for k in RUBRIC_KEYS), small))
            if q.get("feedback"):
                story.append(Paragraph(f"<b>Feedback.</b> {esc(q['feedback'])}", body))
            if q.get("ideal_answer_points"):
                story.append(Paragraph("<b>A strong answer covers:</b> " + "; ".join(esc(p) for p in q["ideal_answer_points"]), small))
            if q.get("retrieval_sources"):
                refs = ", ".join(f"{r.get('section')}#{r.get('chunk_index')}" for r in q["retrieval_sources"])
                story.append(Paragraph(f"Grounded in resume sections: {esc(refs)}", small))
            story.append(Spacer(1, 6))

        # Round transcripts / DSA
        for r in data["rounds"]:
            if r.get("feedback") or r.get("dsa"):
                story.append(Paragraph(f"{r['name'].upper()} round summary", h1))
                if r.get("feedback"):
                    story.append(Paragraph(esc(r["feedback"]), body))
                if r.get("dsa") and any(v is not None for v in r["dsa"].values()):
                    d = r["dsa"]
                    story.append(Paragraph(
                        f"Problems attempted: {d.get('problems_attempted')} · solved: {d.get('problems_solved')} · "
                        f"avg correctness: {d.get('avg_correctness')} · complexity awareness: {d.get('avg_complexity_awareness')}", small))
                ca = r.get("communication_analysis")
                if ca:
                    story.append(Paragraph(
                        f"Communication analytics — words: {ca.get('total_candidate_words')}, filler ratio: {ca.get('filler_ratio')}%, "
                        f"articulation: {ca.get('communication_rating')}/10. {esc(ca.get('filler_feedback', ''))}", small))

        doc.build(story)
        logger.info("Rendered PDF report → %s", dest_path)
