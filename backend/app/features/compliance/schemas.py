"""Pydantic v2 request/response schemas for the compliance feature."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.enums import (
    ComplianceAction,
    ComplianceSeverity,
    ContentRating,
    ReportStatus,
    ReportType,
)


# ── Requests ─────────────────────────────────────────────────────────────────


class ReportSubmitRequest(BaseModel):
    report_type: ReportType
    period_label: str = Field(min_length=1, max_length=100)
    form_data: dict


class ComplianceDecisionRequest(BaseModel):
    action: ComplianceAction
    severity: ComplianceSeverity | None = None
    notes: str = Field(min_length=1, max_length=5000)


# ── Responses ────────────────────────────────────────────────────────────────


class ReportRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    report_type: ReportType
    period_label: str
    form_data: dict
    submitted_at: datetime
    reviewed_at: datetime | None
    status: ReportStatus

    model_config = {"from_attributes": True}


class ComplianceAnalysisRead(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    content_rating: ContentRating
    financial_flags: list
    content_flags: list
    recommended_action: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportWithAnalysisRead(ReportRead):
    compliance_analysis: ComplianceAnalysisRead | None = None


class ReportScheduleEntry(BaseModel):
    report_type: str
    period_label: str
    due_date: date
    status: str  # pending, submitted, overdue


class ReportScheduleResponse(BaseModel):
    application_id: uuid.UUID
    entries: list[ReportScheduleEntry]


class MessageResponse(BaseModel):
    detail: str
