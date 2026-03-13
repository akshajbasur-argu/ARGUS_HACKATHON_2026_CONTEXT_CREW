"""Message domain model (application-scoped conversation thread)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id"), nullable=False, index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    application: Mapped[Application] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="messages", lazy="raise"
    )
    sender: Mapped[User] = relationship(  # type: ignore[name-defined]
        "User", foreign_keys=[sender_id], lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<Message app={self.application_id} sender={self.sender_id}>"


from app.features.applications.models import Application  # noqa: E402, F401
from app.features.auth.models import User  # noqa: E402, F401
