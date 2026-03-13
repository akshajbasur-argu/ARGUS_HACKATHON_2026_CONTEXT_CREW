"""Disbursement and Expenditure domain models."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import DisbursementStatus, DisbursementTrigger, ExpenditureStatus


class Disbursement(Base):
    __tablename__ = "disbursements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    tranche_label: Mapped[str] = mapped_column(String(100), nullable=False)
    amount_inr: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    trigger_type: Mapped[DisbursementTrigger] = mapped_column(
        SAEnum(DisbursementTrigger, name="disbursement_trigger", create_type=True), nullable=False
    )
    status: Mapped[DisbursementStatus] = mapped_column(
        SAEnum(DisbursementStatus, name="disbursement_status", create_type=True),
        nullable=False,
        default=DisbursementStatus.pending,
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # bank_details stored encrypted at application layer — JSONB for flexibility
    bank_details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="disbursements", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Disbursement app={self.application_id} tranche={self.tranche_label!r} status={self.status}>"


class Expenditure(Base):
    """Individual expenditure record submitted by a grantee."""

    __tablename__ = "expenditures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    payee: Mapped[str] = mapped_column(String(255), nullable=False)
    amount_inr: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    budget_category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    receipt_path: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[ExpenditureStatus] = mapped_column(
        SAEnum(ExpenditureStatus, name="expenditure_status", create_type=True),
        nullable=False,
        default=ExpenditureStatus.pending,
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<Expenditure app={self.application_id} amount={self.amount_inr} status={self.status}>"


from app.features.applications.models import Application  # noqa: E402, F401
