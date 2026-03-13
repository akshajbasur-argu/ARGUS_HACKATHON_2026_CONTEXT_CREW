"""Review domain models: assignments, AI packages, and human scores."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ReviewAssignment(Base):
    __tablename__ = "review_assignments"
    __table_args__ = (
        UniqueConstraint("application_id", "reviewer_id", name="uq_review_assignment"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="review_assignments", lazy="raise"
    )
    scores: Mapped[list[ReviewScore]] = relationship(
        "ReviewScore", back_populates="assignment", cascade="all, delete-orphan", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<ReviewAssignment app={self.application_id} reviewer={self.reviewer_id}>"


class ReviewPackage(Base):
    """AI-generated briefing package presented to reviewers before scoring."""

    __tablename__ = "review_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    summary_text: Mapped[str | None] = mapped_column(Text)
    # suggested_scores: {dimension: score} — AI pre-fill
    suggested_scores: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # risk_flags: [{type, description, severity}]
    risk_flags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="review_packages", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<ReviewPackage app={self.application_id} generated_at={self.generated_at}>"


class ReviewScore(Base):
    __tablename__ = "review_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_assignments.id"), nullable=False, index=True
    )
    dimension: Mapped[str] = mapped_column(String(100), nullable=False)
    ai_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    human_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    human_comment: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignment: Mapped[ReviewAssignment] = relationship(
        "ReviewAssignment", back_populates="scores", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<ReviewScore assignment={self.assignment_id} dim={self.dimension!r}>"


from app.features.applications.models import Application  # noqa: E402, F401
