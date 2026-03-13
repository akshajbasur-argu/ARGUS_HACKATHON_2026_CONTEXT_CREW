"""Awardee report and compliance analysis domain models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ContentRating, ReportStatus, ReportType


class Report(Base):
    """Progress or final narrative/financial report submitted by an awardee."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    report_type: Mapped[ReportType] = mapped_column(
        SAEnum(ReportType, name="report_type", create_type=True), nullable=False
    )
    period_label: Mapped[str] = mapped_column(String(100), nullable=False)
    form_data: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ReportStatus] = mapped_column(
        SAEnum(ReportStatus, name="report_status", create_type=True),
        nullable=False,
        default=ReportStatus.submitted,
    )

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="reports", lazy="raise"
    )
    compliance_analysis: Mapped[ComplianceAnalysis | None] = relationship(
        "ComplianceAnalysis", back_populates="report", uselist=False, lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Report app={self.application_id} type={self.report_type} status={self.status}>"


class ComplianceAnalysis(Base):
    """AI-generated compliance analysis of a submitted report."""

    __tablename__ = "compliance_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id"), unique=True, nullable=False, index=True
    )
    content_rating: Mapped[ContentRating] = mapped_column(
        SAEnum(ContentRating, name="content_rating", create_type=True), nullable=False
    )
    financial_flags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    content_flags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    recommended_action: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    report: Mapped[Report] = relationship("Report", back_populates="compliance_analysis", lazy="raise")

    def __repr__(self) -> str:
        return f"<ComplianceAnalysis report={self.report_id} rating={self.content_rating}>"


from app.features.applications.models import Application  # noqa: E402, F401
