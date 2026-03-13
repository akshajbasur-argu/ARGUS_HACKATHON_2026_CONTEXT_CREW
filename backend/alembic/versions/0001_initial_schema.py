"""Initial schema — all GrantFlow domain tables and enum types.

Revision ID: 0001
Revises:
Create Date: 2026-03-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Enum types ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TYPE user_role AS ENUM (
            'platform_admin', 'program_officer', 'reviewer',
            'finance_officer', 'applicant'
        )
    """)
    op.execute("""
        CREATE TYPE org_type AS ENUM (
            'ngo', 'trust', 'society', 'company', 'government', 'individual'
        )
    """)
    op.execute("""
        CREATE TYPE application_status AS ENUM (
            'submitted', 'screening', 'eligible', 'ineligible',
            'under_review', 'review_complete', 'approved', 'rejected',
            'waitlisted', 'agreement_sent', 'agreement_acknowledged',
            'active', 'report_due', 'closed'
        )
    """)
    op.execute("""
        CREATE TYPE screening_outcome AS ENUM (
            'eligible', 'ineligible', 'needs_review'
        )
    """)
    op.execute("""
        CREATE TYPE disbursement_trigger AS ENUM (
            'submission_approval', 'milestone_1', 'milestone_2', 'final'
        )
    """)
    op.execute("""
        CREATE TYPE disbursement_status AS ENUM ('pending', 'ready', 'disbursed')
    """)
    op.execute("""
        CREATE TYPE report_type AS ENUM ('progress', 'final')
    """)
    op.execute("""
        CREATE TYPE report_status AS ENUM (
            'submitted', 'under_review', 'approved', 'rejected'
        )
    """)
    op.execute("""
        CREATE TYPE content_rating AS ENUM (
            'satisfactory', 'needs_attention', 'critical'
        )
    """)

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20)),
        sa.Column("role", sa.Enum(name="user_role", create_type=False), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── organisations ─────────────────────────────────────────────────────────
    op.create_table(
        "organisations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("legal_name", sa.String(512), nullable=False),
        sa.Column("registration_number", sa.String(100)),
        sa.Column("org_type", sa.Enum(name="org_type", create_type=False), nullable=False),
        sa.Column("year_established", sa.Integer),
        sa.Column("state", sa.String(100)),
        sa.Column("annual_budget_inr", sa.Numeric(20, 2)),
        sa.Column("contact_person", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_organisations_user_id", "organisations", ["user_id"], unique=True)

    # ── grant_programmes ──────────────────────────────────────────────────────
    op.create_table(
        "grant_programmes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("purpose", sa.Text),
        sa.Column("funding_min_inr", sa.Numeric(20, 2), nullable=False),
        sa.Column("funding_max_inr", sa.Numeric(20, 2), nullable=False),
        sa.Column("duration_min_months", sa.Integer, nullable=False),
        sa.Column("duration_max_months", sa.Integer, nullable=False),
        sa.Column("max_awards_per_cycle", sa.Integer),
        sa.Column("total_budget_inr", sa.Numeric(20, 2)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("metadata_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_grant_programmes_code", "grant_programmes", ["code"], unique=True)

    # ── applications ──────────────────────────────────────────────────────────
    op.create_table(
        "applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reference_number", sa.String(50), nullable=False),
        sa.Column("programme_id", UUID(as_uuid=True), sa.ForeignKey("grant_programmes.id"), nullable=False),
        sa.Column("applicant_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.Enum(name="application_status", create_type=False), nullable=False,
                  server_default=sa.text("'submitted'")),
        sa.Column("form_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_applications_reference_number", "applications", ["reference_number"], unique=True)
    op.create_index("ix_applications_status", "applications", ["status"])
    op.create_index("ix_applications_applicant_id", "applications", ["applicant_id"])

    # ── documents ─────────────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("doc_type", sa.String(100), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("is_vault_doc", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_documents_application_id", "documents", ["application_id"])
    op.create_index("ix_documents_user_id", "documents", ["user_id"])

    # ── screening_reports ─────────────────────────────────────────────────────
    op.create_table(
        "screening_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hard_checks", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("soft_flags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("overall_result", sa.Enum(name="screening_outcome", create_type=False), nullable=False),
        sa.Column("ai_thematic_score", sa.Numeric(5, 2)),
        sa.Column("ai_narrative_score", sa.Numeric(5, 2)),
        sa.Column("officer_decision", sa.String(20)),
        sa.Column("officer_notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_screening_reports_application_id", "screening_reports", ["application_id"], unique=True)

    # ── review_assignments ────────────────────────────────────────────────────
    op.create_table(
        "review_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("reviewer_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("application_id", "reviewer_id", name="uq_review_assignment"),
    )
    op.create_index("ix_review_assignments_application_id", "review_assignments", ["application_id"])
    op.create_index("ix_review_assignments_reviewer_id", "review_assignments", ["reviewer_id"])

    # ── review_packages ───────────────────────────────────────────────────────
    op.create_table(
        "review_packages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("summary_text", sa.Text),
        sa.Column("suggested_scores", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("risk_flags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_review_packages_application_id", "review_packages", ["application_id"])

    # ── review_scores ─────────────────────────────────────────────────────────
    op.create_table(
        "review_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("assignment_id", UUID(as_uuid=True), sa.ForeignKey("review_assignments.id"), nullable=False),
        sa.Column("dimension", sa.String(100), nullable=False),
        sa.Column("ai_score", sa.Numeric(5, 2)),
        sa.Column("human_score", sa.Numeric(5, 2)),
        sa.Column("human_comment", sa.Text),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_review_scores_assignment_id", "review_scores", ["assignment_id"])

    # ── disbursements ─────────────────────────────────────────────────────────
    op.create_table(
        "disbursements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("tranche_label", sa.String(100), nullable=False),
        sa.Column("amount_inr", sa.Numeric(20, 2), nullable=False),
        sa.Column("trigger_type", sa.Enum(name="disbursement_trigger", create_type=False), nullable=False),
        sa.Column("status", sa.Enum(name="disbursement_status", create_type=False), nullable=False,
                  server_default=sa.text("'pending'")),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("bank_details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_disbursements_application_id", "disbursements", ["application_id"])

    # ── reports ───────────────────────────────────────────────────────────────
    op.create_table(
        "reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("report_type", sa.Enum(name="report_type", create_type=False), nullable=False),
        sa.Column("period_label", sa.String(100), nullable=False),
        sa.Column("form_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Enum(name="report_status", create_type=False), nullable=False,
                  server_default=sa.text("'submitted'")),
    )
    op.create_index("ix_reports_application_id", "reports", ["application_id"])

    # ── compliance_analyses ───────────────────────────────────────────────────
    op.create_table(
        "compliance_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("report_id", UUID(as_uuid=True), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("content_rating", sa.Enum(name="content_rating", create_type=False), nullable=False),
        sa.Column("financial_flags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("content_flags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("recommended_action", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_compliance_analyses_report_id", "compliance_analyses", ["report_id"], unique=True)

    # ── messages ──────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("sender_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_internal_note", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_messages_application_id", "messages", ["application_id"])

    # ── audit_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("object_type", sa.String(100), nullable=False),
        sa.Column("object_id", sa.String(255)),
        sa.Column("metadata_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ── Immutability rules for audit_logs ─────────────────────────────────────
    op.execute("""
        CREATE RULE no_update_audit_logs AS ON UPDATE TO audit_logs DO INSTEAD NOTHING
    """)
    op.execute("""
        CREATE RULE no_delete_audit_logs AS ON DELETE TO audit_logs DO INSTEAD NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP RULE IF EXISTS no_delete_audit_logs ON audit_logs")
    op.execute("DROP RULE IF EXISTS no_update_audit_logs ON audit_logs")

    for table in [
        "audit_logs", "messages", "compliance_analyses", "reports", "disbursements",
        "review_scores", "review_packages", "review_assignments", "screening_reports",
        "documents", "applications", "grant_programmes", "organisations", "users",
    ]:
        op.drop_table(table)

    for enum_name in [
        "content_rating", "report_status", "report_type",
        "disbursement_status", "disbursement_trigger",
        "screening_outcome", "application_status", "org_type", "user_role",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
