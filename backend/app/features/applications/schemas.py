"""Pydantic v2 schemas for the applications feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import ApplicationStatus


# ── Requests ─────────────────────────────────────────────────────────────────


class ApplicationCreate(BaseModel):
    programme_id: uuid.UUID
    form_data: dict[str, Any] = Field(default_factory=dict)


class ApplicationUpdate(BaseModel):
    form_data: dict[str, Any]


class DocumentAttach(BaseModel):
    document_id: uuid.UUID


# ── Responses ────────────────────────────────────────────────────────────────


class ApplicationListItem(BaseModel):
    id: uuid.UUID
    reference_number: str
    programme_id: uuid.UUID
    programme_name: str = ""
    status: ApplicationStatus
    submitted_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentRead(BaseModel):
    id: uuid.UUID
    doc_type: str
    filename: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ApplicationRead(BaseModel):
    id: uuid.UUID
    reference_number: str
    programme_id: uuid.UUID
    programme_name: str = ""
    applicant_id: uuid.UUID
    status: ApplicationStatus
    form_data: dict[str, Any]
    submitted_at: datetime
    updated_at: datetime
    documents: list[DocumentRead] = []

    model_config = {"from_attributes": True}


class TimelineEvent(BaseModel):
    stage: str
    label: str
    occurred_at: datetime | None = None
    is_current: bool = False
    sla_date: str | None = None


class ApplicationTimeline(BaseModel):
    application_id: uuid.UUID
    events: list[TimelineEvent]


# ── Validation helpers ───────────────────────────────────────────────────────


class SubmitValidationError(BaseModel):
    field: str
    message: str
