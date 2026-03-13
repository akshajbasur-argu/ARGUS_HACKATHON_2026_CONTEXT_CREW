"""Grant programme domain model."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GrantProgramme(Base):
    __tablename__ = "grant_programmes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text)
    funding_min_inr: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    funding_max_inr: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    duration_min_months: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_max_months: Mapped[int] = mapped_column(Integer, nullable=False)
    max_awards_per_cycle: Mapped[int | None] = mapped_column(Integer)
    total_budget_inr: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    # JSONB column holds: eligibility_rules, scoring_rubric, disbursement_schedule
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<GrantProgramme code={self.code!r} name={self.name!r}>"
