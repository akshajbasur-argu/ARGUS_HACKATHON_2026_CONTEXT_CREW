"""Pydantic v2 schemas for the screening feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.enums import ApplicationStatus, ScreeningOutcome


# ── Nested types ──────────────────────────────────────────────────────────────


class HardCheckItem(BaseModel):
    rule_code: str
    passed: bool
    detail: str


class SoftFlagItem(BaseModel):
    flag: str
    severity: str = "medium"


# ── Responses ─────────────────────────────────────────────────────────────────


class ScreeningQueueItem(BaseModel):
    """Row in the staff screening queue table."""

    application_id: uuid.UUID
    reference_number: str
    programme_name: str
    applicant_name: str
    submitted_at: datetime
    screening_status: ScreeningOutcome | None = None
    officer_decision: str | None = None
    has_report: bool = False

    model_config = {"from_attributes": True}


class ScreeningReportRead(BaseModel):
    """Full screening report for a single application."""

    id: uuid.UUID
    application_id: uuid.UUID
    reference_number: str = ""
    programme_name: str = ""
    applicant_name: str = ""
    status: ApplicationStatus = ApplicationStatus.screening

    hard_checks: list[HardCheckItem] = []
    soft_flags: list[SoftFlagItem] = []
    overall_result: ScreeningOutcome
    ai_thematic_score: Decimal | None = None
    ai_narrative_score: Decimal | None = None

    officer_decision: str | None = None
    officer_notes: str | None = None
    created_at: datetime
    decided_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Requests ──────────────────────────────────────────────────────────────────


class ScreeningDecision(BaseModel):
    """Officer decision on a screening report."""

    decision: str = Field(
        ..., pattern=r"^(eligible|ineligible|clarification)$",
        description="One of: eligible, ineligible, clarification",
    )
    reason: str | None = Field(None, max_length=2000)
    clarification_question: str | None = Field(None, max_length=2000)
