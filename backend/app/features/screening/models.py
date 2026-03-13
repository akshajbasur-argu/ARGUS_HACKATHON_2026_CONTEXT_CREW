"""Screening report domain model."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ScreeningOutcome


class ScreeningReport(Base):
    __tablename__ = "screening_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True
    )
    # hard_checks: {key: bool} — binary eligibility gates
    hard_checks: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # soft_flags: [{key, message, severity}] — advisory warnings
    soft_flags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    overall_result: Mapped[ScreeningOutcome] = mapped_column(
        SAEnum(ScreeningOutcome, name="screening_outcome", create_type=True), nullable=False
    )
    ai_thematic_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    ai_narrative_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    officer_decision: Mapped[str | None] = mapped_column(String(20))
    officer_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="screening_report", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<ScreeningReport app={self.application_id} result={self.overall_result}>"


from app.features.applications.models import Application  # noqa: E402, F401
