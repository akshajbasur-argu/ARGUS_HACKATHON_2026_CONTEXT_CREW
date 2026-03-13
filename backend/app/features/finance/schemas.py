"""Pydantic v2 request/response schemas for the finance feature."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.enums import DisbursementTrigger, ExpenditureStatus


# ── Disbursement schemas ─────────────────────────────────────────────────────


class ReleaseTrancheRequest(BaseModel):
    bank_account: str = Field(min_length=1, max_length=50)
    ifsc: str = Field(min_length=11, max_length=11)
    beneficiary_name: str = Field(min_length=1, max_length=255)
    payment_reference: str = Field(min_length=1, max_length=100)


class DisbursementRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    tranche_label: str
    amount_inr: Decimal
    trigger_type: DisbursementTrigger
    status: str
    released_at: datetime | None
    bank_details: dict

    model_config = {"from_attributes": True}


# ── Expenditure schemas ──────────────────────────────────────────────────────


class ExpenditureCreateRequest(BaseModel):
    date: date
    payee: str = Field(min_length=1, max_length=255)
    amount_inr: Decimal = Field(gt=0)
    budget_category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=2000)
    receipt_file: str | None = Field(default=None, max_length=1000)


class ExpenditureVerifyRequest(BaseModel):
    status: ExpenditureStatus
    notes: str | None = Field(default=None, max_length=2000)


class ExpenditureRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    submitted_by: uuid.UUID
    date: date
    payee: str
    amount_inr: Decimal
    budget_category: str
    description: str
    receipt_path: str | None
    status: ExpenditureStatus
    reviewer_notes: str | None
    submitted_at: datetime
    verified_at: datetime | None

    model_config = {"from_attributes": True}


# ── Dashboard schemas ────────────────────────────────────────────────────────


class GrantSummary(BaseModel):
    application_id: str
    reference_number: str
    programme_name: str
    status: str
    budget: Decimal
    disbursed: Decimal
    spent: Decimal
    pct_spent: float


class DashboardResponse(BaseModel):
    total_committed: Decimal
    total_disbursed: Decimal
    total_reported_expenditure: Decimal
    grant_count: int
    grants_by_status: dict[str, int]
    grants: list[GrantSummary]


class ProgrammeSummary(BaseModel):
    programme_code: str
    programme_name: str
    committed: Decimal
    disbursed: Decimal
    spent: Decimal
    grant_count: int
    utilisation_pct: float


class ProgrammeDashboardResponse(BaseModel):
    total_committed_inr: Decimal
    total_disbursed_inr: Decimal
    total_reported_expenditure_inr: Decimal
    grants_by_status: dict[str, int]
    per_programme: list[ProgrammeSummary]


class BankDetailsRequest(BaseModel):
    bank_account: str = Field(min_length=1, max_length=50)
    ifsc: str = Field(min_length=11, max_length=11)
    beneficiary_name: str = Field(min_length=1, max_length=255)


class BankDetailsRead(BaseModel):
    application_id: uuid.UUID
    bank_account: str
    ifsc: str
    beneficiary_name: str

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    detail: str
