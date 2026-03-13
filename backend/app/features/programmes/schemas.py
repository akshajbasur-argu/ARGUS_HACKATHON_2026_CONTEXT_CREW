"""Pydantic v2 schemas for the Programmes feature."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


# ── Shared sub-objects ────────────────────────────────────────────────────────

class ApplicationWindow(BaseModel):
    opens: str | None = None   # ISO date string or human label
    closes: str | None = None


class EligibilityCriterion(BaseModel):
    rule_code: str
    description: str
    requirement: str


class ScoringDimension(BaseModel):
    dimension: str
    weight_pct: int          # 0-100


class DisbursementMilestone(BaseModel):
    milestone: str
    pct: int                 # % of total grant


# ── List item (catalogue card) ────────────────────────────────────────────────

class ProgrammeListItem(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    purpose: str | None
    funding_min_inr: Decimal
    funding_max_inr: Decimal
    duration_min_months: int
    duration_max_months: int
    application_window: ApplicationWindow
    scoring_dimensions: list[ScoringDimension]
    is_active: bool

    model_config = {"from_attributes": True}


# ── Full detail ───────────────────────────────────────────────────────────────

class ProgrammeDetail(ProgrammeListItem):
    eligibility_criteria: list[EligibilityCriterion]
    disbursement_schedule: list[DisbursementMilestone]
    max_awards_per_cycle: int | None
    total_budget_inr: Decimal | None

    model_config = {"from_attributes": True}


# ── Precheck ──────────────────────────────────────────────────────────────────

class PrecheckRequest(BaseModel):
    org_type: str = Field(..., description="Organisation type, e.g. NGO, Trust, EdTech")
    project_district: str = Field(..., description="District where project will run")
    funding_amount_inr: Decimal = Field(..., gt=0)
    programme_id: uuid.UUID | None = Field(
        None, description="Limit check to one programme"
    )


class FailedRule(BaseModel):
    rule_code: str
    reason: str


class PrecheckResultItem(BaseModel):
    programme_id: uuid.UUID
    programme_code: str
    programme_name: str
    result: Literal["likely_eligible", "likely_ineligible"]
    failed_rules: list[FailedRule]
