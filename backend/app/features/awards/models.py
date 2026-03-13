"""Award, AwardLetter, and Agreement domain models."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import AgreementStatus, AwardDecision, LetterStatus


class AwardRecord(Base):
    """Tracks the decision on an application (approved/rejected/waitlisted)."""

    __tablename__ = "award_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, unique=True, index=True
    )
    decided_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    decision: Mapped[AwardDecision] = mapped_column(
        SAEnum(AwardDecision, name="award_decision", create_type=True), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    award_amount: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    special_conditions: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    letter: Mapped[AwardLetter | None] = relationship(
        "AwardLetter", back_populates="award_record", uselist=False, lazy="raise"
    )
    agreement: Mapped[Agreement | None] = relationship(
        "Agreement", back_populates="award_record", uselist=False, lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<AwardRecord app={self.application_id} decision={self.decision}>"


class AwardLetter(Base):
    """Generated letter (award or rejection) as HTML draft, then sent."""

    __tablename__ = "award_letters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    award_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("award_records.id"), nullable=False, unique=True, index=True
    )
    letter_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "award" or "rejection"
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[LetterStatus] = mapped_column(
        SAEnum(LetterStatus, name="letter_status", create_type=True),
        nullable=False,
        default=LetterStatus.draft,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    award_record: Mapped[AwardRecord] = relationship(
        "AwardRecord", back_populates="letter", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<AwardLetter type={self.letter_type!r} status={self.status}>"


class Agreement(Base):
    """Grant agreement generated from template, sent to grantee for acknowledgement."""

    __tablename__ = "agreements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    award_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("award_records.id"), nullable=False, unique=True, index=True
    )
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    special_conditions: Mapped[str | None] = mapped_column(Text)
    tranche_summary: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[AgreementStatus] = mapped_column(
        SAEnum(AgreementStatus, name="agreement_status", create_type=True),
        nullable=False,
        default=AgreementStatus.draft,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    award_record: Mapped[AwardRecord] = relationship(
        "AwardRecord", back_populates="agreement", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Agreement award={self.award_record_id} status={self.status}>"
