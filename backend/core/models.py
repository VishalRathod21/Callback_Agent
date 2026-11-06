"""SQLAlchemy ORM models for InterviewAI.

Schema overview (see DATABASE_SCHEMA.md):

    users ─┬─< refresh_tokens
           └─< candidates ─< interview_sessions ─┬─< round_transcripts
                                                 ├─< interview_questions
                                                 └── interview_reports (1:1)
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ──────────────────────────────────────────────────────────────────────


class CandidateStatus(str, enum.Enum):
    """Status tracking for a candidate in the pipeline."""

    UPLOADED = "uploaded"
    SCREENED = "screened"
    INTERVIEWING = "interviewing"
    COMPLETED = "completed"
    REJECTED = "rejected"


class RoundName(str, enum.Enum):
    """Types of interview rounds."""

    DSA = "dsa"
    TECHNICAL = "technical"
    HR = "hr"


class SessionStatus(str, enum.Enum):
    """Status of an interview session."""

    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# ── Models ─────────────────────────────────────────────────────────────────────


class User(Base):
    """A registered user of the Callback mock interview platform."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    profile_image: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # User preferences (voice mode default, preferred difficulty, ...)
    preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    candidates: Mapped[list["Candidate"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User {self.full_name} ({self.email})>"


class RefreshToken(Base):
    """Refresh token for maintaining persistent user sessions across devices."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    def __repr__(self) -> str:
        return f"<RefreshToken user_id={self.user_id} revoked={self.revoked}>"


class Candidate(Base):
    """A candidate profile (one uploaded resume) owned by a user."""

    __tablename__ = "candidates"
    __table_args__ = (
        # A user may keep several candidate profiles, but one per e-mail.
        UniqueConstraint("user_id", "email", name="uq_candidates_user_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    resume_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    target_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ats_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[CandidateStatus] = mapped_column(
        Enum(CandidateStatus), default=CandidateStatus.UPLOADED, nullable=False
    )
    # Structured profile extracted from the resume (skills, projects, experience, education, ...)
    resume_structured: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # ATS screening output (matched/missing skills, reasoning, decision, source)
    screening_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Resume document metadata
    resume_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resume_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resume_chunk_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resume_parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    user: Mapped["User | None"] = relationship(back_populates="candidates")
    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan", order_by="InterviewSession.started_at"
    )

    def __repr__(self) -> str:
        return f"<Candidate {self.name} ({self.email})>"


class InterviewSession(Base):
    """An interview session for a candidate, spanning one or more rounds."""

    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("candidates.id"), nullable=False)
    current_round: Mapped[RoundName] = mapped_column(Enum(RoundName), default=RoundName.DSA, nullable=False)
    round_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.PENDING, nullable=False)
    # Interview configuration chosen by the candidate:
    # {rounds: [...], difficulty: easy|medium|hard, mode: voice|text,
    #  questions_per_round: int, duration_minutes: int, job_description: str, adaptive: bool}
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mode: Mapped[str | None] = mapped_column(String(20), nullable=True)            # voice | text
    target_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_questions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Snapshot of the agent persona used for this session
    persona: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    candidate: Mapped["Candidate"] = relationship(back_populates="sessions")
    transcripts: Mapped[list["RoundTranscript"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="InterviewQuestion.asked_at"
    )
    report: Mapped["InterviewReport | None"] = relationship(
        back_populates="session", cascade="all, delete-orphan", uselist=False
    )

    def __repr__(self) -> str:
        return f"<InterviewSession {self.id} round={self.current_round}>"


class RoundTranscript(Base):
    """Transcript and aggregated evaluation for a single interview round."""

    __tablename__ = "round_transcripts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False
    )
    round_name: Mapped[str] = mapped_column(String(50), nullable=False)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    session: Mapped["InterviewSession"] = relationship(back_populates="transcripts")

    def __repr__(self) -> str:
        return f"<RoundTranscript {self.id} round={self.round_name}>"


class InterviewQuestion(Base):
    """One question/answer exchange with its rubric evaluation and difficulty trace."""

    __tablename__ = "interview_questions"
    __table_args__ = (
        Index("ix_interview_questions_session_round", "session_id", "round_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False
    )
    round_name: Mapped[str] = mapped_column(String(50), nullable=False)
    question_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)      # easy|medium|hard
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_follow_up: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Rubric scores on 0-10
    technical_correctness: Mapped[float | None] = mapped_column(Float, nullable=True)
    conceptual_understanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    answer_completeness: Mapped[float | None] = mapped_column(Float, nullable=True)
    communication_clarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    next_difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Full structured evaluation JSON (feedback, strengths, evidence, ...)
    evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # llm | heuristic | unavailable — how the scores were produced
    evaluation_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # llm | bank — how the question text was produced
    generation_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Resume chunks retrieved to generate this question: [{chunk_id, section, score, preview}]
    retrieval_sources: Mapped[list | None] = mapped_column(JSON, nullable=True)
    generation_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evaluation_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    asked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")

    def __repr__(self) -> str:
        return f"<InterviewQuestion {self.round_name}#{self.question_index} score={self.overall_score}>"


class InterviewReport(Base):
    """Generated final report for a session (JSON payload + optional PDF path)."""

    __tablename__ = "interview_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interview_sessions.id"), nullable=False, unique=True
    )
    report_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    narrative_source: Mapped[str | None] = mapped_column(String(20), nullable=True)   # llm | fallback
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    session: Mapped["InterviewSession"] = relationship(back_populates="report")

    def __repr__(self) -> str:
        return f"<InterviewReport session={self.session_id}>"
