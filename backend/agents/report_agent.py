"""AI Evaluation Report Generator.

Analyzes candidate metrics and round transcripts using Groq/LLM Service,
and generates a stylized multi-page PDF evaluation report using ReportLab.
"""

import json
import logging
import os
from datetime import datetime, timezone

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.graphics.shapes import Drawing, Rect, String

from core.config import settings
from core.models import Candidate, InterviewSession, RoundTranscript
from services.llm_service import llm_service as global_llm_service

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert talent partner and technical interviewer.
Analyze the candidate's interview performance across all rounds and generate a narrative evaluation.
Return your response as a single, valid JSON object matching the required schema.

Required JSON schema:
{
  "executive_summary": "<A professional 3-line narrative summarizing overall performance, communication, and fit>",
  "strengths": [
    "<Strength 1>",
    "<Strength 2>",
    "<Strength 3>"
  ],
  "improvements": [
    "<Improvement area 1>",
    "<Improvement area 2>",
    "<Improvement area 3>"
  ],
  "final_recommendation": "hire" | "no_hire" | "maybe"
}

Rules:
- Strengths and improvements must be exactly 3 specific, actionable bullet points each.
- Ensure the executive summary is exactly 3 lines/sentences long and gives a balanced, deep view.
- Base recommendation strictly on the provided score signals and transcripts.
"""


class ReportAgent:
    """Generates comprehensive PDF feedback reports for interview candidates."""

    def __init__(self, llm_service=None, model_name: str = None) -> None:
        self.llm_service = llm_service or global_llm_service

    async def generate_report(
        self,
        candidate: Candidate,
        session: InterviewSession,
        transcripts: list[RoundTranscript]
    ) -> str:
        """Analyze interview performance via LLM and render a stylized PDF report.

        Args:
            candidate: Candidate database object.
            session: Interview session database object.
            transcripts: List of RoundTranscript objects associated with the session.

        Returns:
            The local file path to the generated PDF.
        """
        # 1. Fetch AI narrative summary via LLM
        try:
            summary_data = await self._generate_narrative_summary(candidate, session, transcripts)
        except Exception as exc:
            logger.warning("Narrative generation failed in PDF generator, using fallback: %s", exc)
            summary_data = {
                "executive_summary": "Rehearsal evaluation scorecard successfully compiled. Individual round breakdown and detailed dialogue history are attached below.",
                "strengths": [
                    "Completed the technical rehearsal round requirements.",
                    "Completed the behavioural rehearsal round requirements.",
                    "Demonstrated structured analytical approach."
                ],
                "improvements": [
                    "Continue practice across technical topics.",
                    "Focus on STAR communication methodology.",
                    "Refine code optimization patterns."
                ],
                "final_recommendation": "maybe"
            }

        # 2. Setup output directories
        candidate_dir = os.path.join(settings.UPLOAD_DIR, str(candidate.id))
        os.makedirs(candidate_dir, exist_ok=True)
        pdf_path = os.path.join(candidate_dir, "report.pdf")

        # 3. Render PDF document
        await self._render_pdf(pdf_path, candidate, session, transcripts, summary_data)

        logger.info("Successfully generated PDF report for candidate %s at %s", candidate.id, pdf_path)
        return pdf_path

    # ── Narrative Generation ───────────────────────────────────────────

    async def _generate_narrative_summary(
        self,
        candidate: Candidate,
        session: InterviewSession,
        transcripts: list[RoundTranscript]
    ) -> dict:
        """Call LLM to synthesize a professional narrative evaluation."""
        user_message = f"""\
CANDIDATE INFO:
Name: {candidate.name}
Target Role: {candidate.target_role}
ATS Resume Score: {candidate.ats_score or "N/A"}

INTERVIEW SESSION INFO:
Overall Score: {session.overall_score or "N/A"}
Round Scores: {session.round_scores or "N/A"}

ROUND TRANSCRIPTS:
"""
        for t in transcripts:
            user_message += f"\n--- {t.round_name.upper()} ROUND (Score: {t.score or 0}) ---\n"
            user_message += f"Transcript:\n{t.transcript or 'No transcript'}\n"
            if t.ai_evaluation:
                user_message += f"AI Feedback: {t.ai_evaluation.get('feedback', '')}\n"

        logger.info("Generating report narrative for candidate %s", candidate.id)
        try:
            result = await self.llm_service.generate_json(
                user_message,
                system_instruction=_SYSTEM_PROMPT
            )
            if result is not None:
                return result
        except Exception as exc:
            logger.error("Failed to generate report narrative: %s", exc)
            raise ValueError(f"Could not parse narrative evaluation JSON from LLM: {exc}")

        raise ValueError("Could not parse narrative evaluation JSON from LLM.")

    # ── PDF Generation ─────────────────────────────────────────────────

    async def _render_pdf(
        self,
        dest_path: str,
        candidate: Candidate,
        session: InterviewSession,
        transcripts: list[RoundTranscript],
        summary_data: dict
    ) -> None:
        """Build the PDF layout pages using ReportLab."""
        doc = SimpleDocTemplate(
            dest_path,
            pagesize=letter,
            rightMargin=54,
            leftMargin=54,
            topMargin=54,
            bottomMargin=54
        )

        styles = getSampleStyleSheet()

        # Custom Premium Typography Styles
        title_style = ParagraphStyle(
            'DocTitle', parent=styles['Normal'],
            fontName='Helvetica-Bold', fontSize=26, leading=32,
            textColor=colors.HexColor('#1a365d'), spaceAfter=5
        )
        subtitle_style = ParagraphStyle(
            'DocSubtitle', parent=styles['Normal'],
            fontName='Helvetica', fontSize=14, leading=18,
            textColor=colors.HexColor('#4a5568'), spaceAfter=20
        )
        h1_style = ParagraphStyle(
            'SectionHeading', parent=styles['Normal'],
            fontName='Helvetica-Bold', fontSize=18, leading=22,
            textColor=colors.HexColor('#1a365d'), spaceBefore=20, spaceAfter=10,
            keepWithNext=True
        )
        body_style = ParagraphStyle(
            'BodyTextCustom', parent=styles['Normal'],
            fontName='Helvetica', fontSize=10, leading=15,
            textColor=colors.HexColor('#2d3748'), spaceAfter=8
        )
        bullet_style = ParagraphStyle(
            'BulletTextCustom', parent=styles['Normal'],
            fontName='Helvetica', fontSize=10, leading=14,
            textColor=colors.HexColor('#2d3748'), leftIndent=15, spaceAfter=6
        )
        transcript_speaker_style = ParagraphStyle(
            'TranscriptSpeaker', parent=styles['Normal'],
            fontName='Helvetica-Bold', fontSize=9, leading=12,
            textColor=colors.HexColor('#1a365d'), spaceBefore=4, spaceAfter=2
        )
        transcript_text_style = ParagraphStyle(
            'TranscriptText', parent=styles['Normal'],
            fontName='Helvetica', fontSize=9, leading=13,
            textColor=colors.HexColor('#4a5568'), spaceAfter=6
        )

        story = []

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # PAGE 1: COVER & METRICS
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # Header / Brand Logo text
        story.append(Paragraph("<b>InterviewAI</b>", ParagraphStyle('Logo', parent=title_style, fontSize=12, textColor=colors.HexColor('#3182ce'))))
        story.append(Spacer(1, 15))
        
        story.append(Paragraph("Candidate Evaluation Report", title_style))
        story.append(Paragraph(f"Feedback & Performance Metrics for {candidate.name}", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=20))

        # Metadata Table (Candidate info)
        meta_data = [
            [Paragraph("<b>Candidate Name:</b>", body_style), Paragraph(candidate.name, body_style)],
            [Paragraph("<b>Target Role:</b>", body_style), Paragraph(candidate.target_role or "N/A", body_style)],
            [Paragraph("<b>Interview Date:</b>", body_style), Paragraph(datetime.now(timezone.utc).strftime("%d %B %Y"), body_style)],
            [Paragraph("<b>ATS resume Match:</b>", body_style), Paragraph(f"{candidate.ats_score or 0:.1f}%", body_style)],
        ]
        meta_table = Table(meta_data, colWidths=[150, 350])
        meta_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 30))

        # Overall Score Box
        overall_score = session.overall_score or 0.0
        score_color = '#2f855a' if overall_score >= 75 else ('#d69e2e' if overall_score >= 50 else '#c53030')
        
        score_title = ParagraphStyle('ScoreTitle', parent=body_style, fontSize=12, textColor=colors.HexColor('#718096'), alignment=1)
        score_num_style = ParagraphStyle('ScoreNum', parent=title_style, fontSize=48, leading=52, textColor=colors.HexColor(score_color), alignment=1)
        
        overall_score_box = Table([
            [Paragraph("OVERALL INTERVIEW SCORE", score_title)],
            [Paragraph(f"{overall_score:.1f}%", score_num_style)]
        ], colWidths=[500])
        
        overall_score_box.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f7fafc')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#e2e8f0')),
            ('PADDING', (0,0), (-1,-1), 16),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ]))
        story.append(overall_score_box)
        story.append(Spacer(1, 35))

        # Round Scores Chart
        story.append(Paragraph("Performance by Round", h1_style))
        story.append(Spacer(1, 10))

        # Bar chart
        round_scores = session.round_scores or {}
        if not round_scores:
            round_scores = {t.round_name: t.score for t in transcripts if t.score is not None}
        
        if round_scores:
            chart_drawing = Drawing(500, 120)
            y_offset = 80
            for r_name, r_score in round_scores.items():
                score_val = r_score or 0.0
                # Label
                chart_drawing.add(String(10, y_offset + 3, r_name.upper(), fontName="Helvetica-Bold", fontSize=9, fillColor=colors.HexColor('#4a5568')))
                # BG Bar
                chart_drawing.add(Rect(100, y_offset, 300, 12, fillColor=colors.HexColor('#edf2f7'), strokeColor=None))
                # FG Bar
                bar_color = '#2f855a' if score_val >= 75 else ('#d69e2e' if score_val >= 50 else '#c53030')
                chart_drawing.add(Rect(100, y_offset, int(3.0 * score_val), 12, fillColor=colors.HexColor(bar_color), strokeColor=None))
                # Score Text
                chart_drawing.add(String(415, y_offset + 2, f"{score_val:.1f}%", fontName="Helvetica-Bold", fontSize=9, fillColor=colors.HexColor('#2d3748')))
                y_offset -= 35
            story.append(chart_drawing)
        else:
            story.append(Paragraph("No individual round score data available.", body_style))

        # End of Page 1
        story.append(PageBreak())

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # PAGE 2: SUMMARY & RECOMMENDATION
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        story.append(Paragraph("Evaluation Summary", title_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=15))

        # Executive Summary
        story.append(Paragraph("Executive Summary", h1_style))
        story.append(Paragraph(summary_data.get("executive_summary", "No summary available."), body_style))
        story.append(Spacer(1, 15))

        # Strengths & Weaknesses
        story.append(Paragraph("Key Strengths", h1_style))
        for strength in summary_data.get("strengths", []):
            story.append(Paragraph(f"• {strength}", bullet_style))
        story.append(Spacer(1, 15))

        story.append(Paragraph("Areas for Development", h1_style))
        for improvement in summary_data.get("improvements", []):
            story.append(Paragraph(f"• {improvement}", bullet_style))
        story.append(Spacer(1, 20))

        # Recommendation Box
        story.append(Paragraph("Hiring Recommendation", h1_style))
        rec_val = summary_data.get("final_recommendation", "maybe").upper()
        
        bg_color = '#ebf8ff'
        text_color = '#2b6cb0'
        border_color = '#bee3f8'
        if rec_val == "HIRE":
            bg_color = '#f0fff4'
            text_color = '#22543d'
            border_color = '#c6f6d5'
        elif rec_val == "NO_HIRE":
            bg_color = '#fff5f5'
            text_color = '#742a2a'
            border_color = '#fed7d7'
            rec_val = "DO NOT HIRE"

        rec_text = Paragraph(f"<b>RECOMMENDATION:</b> {rec_val}", ParagraphStyle('RecTextStyle', parent=body_style, fontSize=12, leading=16, textColor=colors.HexColor(text_color), alignment=1))
        rec_table = Table([[rec_text]], colWidths=[500])
        rec_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg_color)),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor(border_color)),
            ('PADDING', (0,0), (-1,-1), 12),
        ]))
        story.append(rec_table)

        # End of Page 2
        story.append(PageBreak())

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # PAGE 3+: TRANSCRIPTS
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        story.append(Paragraph("Interview Transcripts", title_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=15))

        for t in transcripts:
            story.append(Paragraph(f"{t.round_name.upper()} Round &mdash; Score: {t.score or 0:.1f}%", h1_style))
            
            # Add round specific evaluation details if available
            eval_data = t.ai_evaluation or {}
            comm_data = eval_data.get("communication_analysis")
            if comm_data:
                comm_text = f"<b>Communication Analytics:</b> Articulation Score: {comm_data['communication_rating']}/10 | Filler Ratio: {comm_data['filler_ratio']}% | Words Spoken: {comm_data['total_candidate_words']}.<br/><i>Feedback: {comm_data['filler_feedback']}</i>"
                story.append(Paragraph(comm_text, body_style))
                story.append(Spacer(1, 8))

            if t.round_name == "technical":
                tech_details = []
                if "strengths" in eval_data:
                    tech_details.append(Paragraph(f"<b>Strengths:</b> {eval_data['strengths']}", body_style))
                if "weaknesses" in eval_data:
                    tech_details.append(Paragraph(f"<b>Weaknesses:</b> {eval_data['weaknesses']}", body_style))
                if "recommendations" in eval_data:
                    tech_details.append(Paragraph(f"<b>Recommendations:</b> {eval_data['recommendations']}", body_style))
                for detail in tech_details:
                    story.append(detail)
                if tech_details:
                    story.append(Spacer(1, 10))
            elif t.round_name == "hr":
                hr_details = []
                scores_text = []
                if "communication_score" in eval_data:
                    scores_text.append(f"Communication: {eval_data['communication_score']}/10")
                if "confidence_score" in eval_data:
                    scores_text.append(f"Confidence: {eval_data['confidence_score']}/10")
                if "behavioral_score" in eval_data:
                    scores_text.append(f"Behavioral: {eval_data['behavioral_score']}/10")
                if scores_text:
                    hr_details.append(Paragraph(f"<b>Scores:</b> {', '.join(scores_text)}", body_style))
                if "recommendations" in eval_data:
                    hr_details.append(Paragraph(f"<b>Recommendations:</b> {eval_data['recommendations']}", body_style))
                for detail in hr_details:
                    story.append(detail)
                if hr_details:
                    story.append(Spacer(1, 10))

            # Format and break up transcript dialogue
            t_text = t.transcript or ""
            lines = t_text.split("\n")
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Highlight speaker prefixes
                if line.startswith("Interviewer:") or line.startswith("AI:"):
                    parts = line.split(":", 1)
                    speaker_para = Paragraph(f"{parts[0]}:", transcript_speaker_style)
                    content_para = Paragraph(parts[1].strip(), transcript_text_style)
                    story.append(speaker_para)
                    story.append(content_para)
                elif line.startswith("Candidate:") or line.startswith("User:"):
                    parts = line.split(":", 1)
                    speaker_para = Paragraph(f"{parts[0]}:", ParagraphStyle('CandSpeaker', parent=transcript_speaker_style, textColor=colors.HexColor('#2b6cb0')))
                    content_para = Paragraph(parts[1].strip(), transcript_text_style)
                    story.append(speaker_para)
                    story.append(content_para)
                else:
                    story.append(Paragraph(line, transcript_text_style))
                    
            story.append(Spacer(1, 15))

        # Build document
        doc.build(story)
