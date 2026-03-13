"""Finance tables — expenditures.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-13 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── expenditures ──────────────────────────────────────────────────────────
    # Drop type if exists due to partial failure of previous migration attempt
    op.execute("DROP TYPE IF EXISTS expenditure_status CASCADE")

    op.create_table(
        "expenditures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("application_id", UUID(as_uuid=True), sa.ForeignKey("applications.id"), nullable=False),
        sa.Column("submitted_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("payee", sa.String(255), nullable=False),
        sa.Column("amount_inr", sa.Numeric(20, 2), nullable=False),
        sa.Column("budget_category", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("receipt_path", sa.String(1000)),
        sa.Column("status", sa.Enum("pending", "verified", "queried", "rejected", name="expenditure_status"), nullable=False, server_default="pending"),
        sa.Column("reviewer_notes", sa.Text()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_expenditures_application_id", "expenditures", ["application_id"])
    op.create_index("ix_expenditures_submitted_by", "expenditures", ["submitted_by"])


def downgrade() -> None:
    op.drop_table("expenditures")
    op.execute("DROP TYPE IF EXISTS expenditure_status")
