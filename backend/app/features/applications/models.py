"""Application and Document domain models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ApplicationStatus


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    programme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("grant_programmes.id"), nullable=False, index=True
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus, name="application_status", create_type=True),
        nullable=False,
        default=ApplicationStatus.submitted,
        index=True,
    )
    form_data: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # ── Relationships (child-to-parent only; children hang off Application) ───
    documents: Mapped[list[Document]] = relationship(
        "Document", back_populates="application", foreign_keys="Document.application_id", lazy="raise"
    )
    screening_report: Mapped[ScreeningReport | None] = relationship(  # type: ignore[name-defined]
        "ScreeningReport", back_populates="application", uselist=False, lazy="raise"
    )
    review_assignments: Mapped[list[ReviewAssignment]] = relationship(  # type: ignore[name-defined]
        "ReviewAssignment", back_populates="application", lazy="raise"
    )
    review_packages: Mapped[list[ReviewPackage]] = relationship(  # type: ignore[name-defined]
        "ReviewPackage", back_populates="application", lazy="raise"
    )
    disbursements: Mapped[list[Disbursement]] = relationship(  # type: ignore[name-defined]
        "Disbursement", back_populates="application", lazy="raise"
    )
    reports: Mapped[list[Report]] = relationship(  # type: ignore[name-defined]
        "Report", back_populates="application", lazy="raise"
    )
    messages: Mapped[list[Message]] = relationship(  # type: ignore[name-defined]
        "Message", back_populates="application", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Application ref={self.reference_number!r} status={self.status}>"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    is_vault_doc: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    application: Mapped[Application | None] = relationship(
        "Application", back_populates="documents", foreign_keys=[application_id], lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id} doc_type={self.doc_type!r} filename={self.filename!r}>"


# Deferred cross-feature imports — resolved at mapper config time
from app.features.screening.models import ScreeningReport  # noqa: E402, F401
from app.features.review.models import ReviewAssignment, ReviewPackage  # noqa: E402, F401
from app.features.finance.models import Disbursement  # noqa: E402, F401
from app.features.compliance.models import Report  # noqa: E402, F401
from app.features.messaging.models import Message  # noqa: E402, F401
