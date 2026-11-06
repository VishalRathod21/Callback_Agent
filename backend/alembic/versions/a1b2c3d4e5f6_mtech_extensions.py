"""M.Tech extensions: users/refresh_tokens (if missing), interview configuration, question-level
persistence, reports, resume metadata, per-user candidate uniqueness.

Revision ID: a1b2c3d4e5f6
Revises: ff35ecccfbc1
Create Date: 2026-11-06

This revision is written idempotently (it inspects the live schema) so it can be
applied both to databases bootstrapped by ``Base.metadata.create_all`` and to
databases that followed the Alembic chain.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "ff35ecccfbc1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_column(insp, table: str, column: str) -> bool:
    return column in {c["name"] for c in insp.get_columns(table)}


def _add_column(insp, table: str, column: sa.Column) -> None:
    if not _has_column(insp, table, column.name):
        op.add_column(table, column)


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    is_pg = bind.dialect.name == "postgresql"
    json_type = sa.dialects.postgresql.JSONB() if is_pg else sa.JSON()

    # ── users / refresh_tokens (were never created by earlier revisions) ──
    if not _has_table(insp, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("full_name", sa.String(255), nullable=False),
            sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
            sa.Column("password_hash", sa.String(512), nullable=False),
            sa.Column("profile_image", sa.String(512)),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_login", sa.DateTime(timezone=True)),
            sa.Column("reset_token", sa.String(255)),
            sa.Column("reset_token_expires_at", sa.DateTime(timezone=True)),
            sa.Column("verification_token", sa.String(255)),
            sa.Column("verification_token_expires_at", sa.DateTime(timezone=True)),
            sa.Column("preferences", json_type),
        )
    else:
        _add_column(insp, "users", sa.Column("preferences", json_type))

    if not _has_table(insp, "refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("refresh_token_hash", sa.String(512), nullable=False, unique=True, index=True),
            sa.Column("device_name", sa.String(255)),
            sa.Column("browser", sa.String(255)),
            sa.Column("ip_address", sa.String(45)),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # ── candidates ──
    insp = inspect(bind)
    for col in (
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id")),
        sa.Column("resume_structured", json_type),
        sa.Column("screening_result", json_type),
        sa.Column("resume_filename", sa.String(255)),
        sa.Column("resume_pages", sa.Integer()),
        sa.Column("resume_word_count", sa.Integer()),
        sa.Column("resume_chunk_count", sa.Integer()),
        sa.Column("resume_parsed_at", sa.DateTime(timezone=True)),
    ):
        _add_column(insp, "candidates", col)
    if is_pg:
        op.execute("ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_email_key")
        op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_user_email ON candidates (user_id, email)")

    # ── interview_sessions ──
    insp = inspect(bind)
    for col in (
        sa.Column("config", json_type),
        sa.Column("mode", sa.String(20)),
        sa.Column("target_role", sa.String(255)),
        sa.Column("total_questions", sa.Integer()),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("persona", json_type),
    ):
        _add_column(insp, "interview_sessions", col)
    if is_pg:
        op.execute("ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")

    # ── interview_questions ──
    if not _has_table(insp, "interview_questions"):
        op.create_table(
            "interview_questions",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("session_id", sa.UUID(), sa.ForeignKey("interview_sessions.id"), nullable=False),
            sa.Column("round_name", sa.String(50), nullable=False),
            sa.Column("question_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("category", sa.String(100)),
            sa.Column("difficulty", sa.String(20)),
            sa.Column("question_text", sa.Text(), nullable=False),
            sa.Column("answer_text", sa.Text()),
            sa.Column("is_follow_up", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("technical_correctness", sa.Float()),
            sa.Column("conceptual_understanding", sa.Float()),
            sa.Column("answer_completeness", sa.Float()),
            sa.Column("communication_clarity", sa.Float()),
            sa.Column("overall_score", sa.Float()),
            sa.Column("next_difficulty", sa.String(20)),
            sa.Column("evaluation", json_type),
            sa.Column("evaluation_source", sa.String(20)),
            sa.Column("generation_source", sa.String(20)),
            sa.Column("retrieval_sources", json_type),
            sa.Column("generation_latency_ms", sa.Integer()),
            sa.Column("evaluation_latency_ms", sa.Integer()),
            sa.Column("asked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("answered_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_interview_questions_session_round", "interview_questions", ["session_id", "round_name"])

    # ── interview_reports ──
    if not _has_table(insp, "interview_reports"):
        op.create_table(
            "interview_reports",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("session_id", sa.UUID(), sa.ForeignKey("interview_sessions.id"), nullable=False, unique=True),
            sa.Column("report_data", json_type),
            sa.Column("pdf_path", sa.String(512)),
            sa.Column("narrative_source", sa.String(20)),
            sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("interview_reports")
    op.drop_index("ix_interview_questions_session_round", table_name="interview_questions")
    op.drop_table("interview_questions")
    for col in ("config", "mode", "target_role", "total_questions", "duration_seconds", "persona"):
        op.drop_column("interview_sessions", col)
    for col in ("screening_result", "resume_filename", "resume_pages", "resume_word_count", "resume_chunk_count", "resume_parsed_at"):
        op.drop_column("candidates", col)
    op.drop_column("users", "preferences")
