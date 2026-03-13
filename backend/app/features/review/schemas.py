"""Pydantic v2 schemas for the review feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import ApplicationStatus


# ── Nested types ──────────────────────────────────────────────────────────────


class RiskFlagItem(BaseModel):
    type: str = ""
    description: str
    severity: str = "medium"


class ScoreDimension(BaseModel):
    dimension: str
    label: str = ""
    weight: int = 0
    ai_score: Decimal | None = None
    human_score: Decimal | None = None
    human_comment: str | None = None


class ReviewerScoreSet(BaseModel):
    """All scores from a single reviewer."""

    reviewer_id: uuid.UUID
    reviewer_name: str = ""
    completed_at: datetime | None = None
    scores: list[ScoreDimension] = []
    composite_score: Decimal | None = None


# ── Requests ──────────────────────────────────────────────────────────────────


class AssignReviewers(BaseModel):
    reviewer_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=5)


class ScoreItem(BaseModel):
    dimension: str
    human_score: int = Field(..., ge=1, le=5)
    comment: str | None = None


class SubmitScores(BaseModel):
    scores: list[ScoreItem] = Field(..., min_length=1)


class PostReviewDecision(BaseModel):
    decision: str = Field(
        ..., pattern=r"^(approved|rejected|waitlisted)$",
        description="One of: approved, rejected, waitlisted",
    )
    reason: str = Field(..., min_length=5, max_length=2000)


# ── Responses ─────────────────────────────────────────────────────────────────


class AssignmentQueueItem(BaseModel):
    """Row in the reviewer's queue."""

    assignment_id: uuid.UUID
    application_id: uuid.UUID
    reference_number: str
    programme_name: str
    applicant_name: str
    assigned_at: datetime
    completed_at: datetime | None = None
    has_package: bool = False

    model_config = {"from_attributes": True}


class ReviewPackageRead(BaseModel):
    """AI-generated review briefing."""

    id: uuid.UUID
    summary_text: str = ""
    suggested_scores: dict[str, Any] = {}
    risk_flags: list[RiskFlagItem] = []
    generated_at: datetime

    model_config = {"from_attributes": True}


class ReviewWorkspaceData(BaseModel):
    """Full data for the reviewer workspace."""

    application_id: uuid.UUID
    reference_number: str
    programme_name: str
    programme_code: str = ""
    applicant_name: str = ""
    status: ApplicationStatus
    form_data: dict[str, Any] = {}
    documents: list[dict[str, Any]] = []

    assignment_id: uuid.UUID
    assigned_at: datetime
    completed_at: datetime | None = None

    package: ReviewPackageRead | None = None
    rubric: list[dict[str, Any]] = []
    existing_scores: list[ScoreDimension] = []


class PostReviewQueueItem(BaseModel):
    """Row in the staff post-review decisions queue."""

    application_id: uuid.UUID
    reference_number: str
    programme_name: str
    programme_code: str = ""
    applicant_name: str = ""
    status: ApplicationStatus
    reviewer_scores: list[ReviewerScoreSet] = []
    composite_score: Decimal | None = None
    review_completed_at: datetime | None = None

    model_config = {"from_attributes": True}
