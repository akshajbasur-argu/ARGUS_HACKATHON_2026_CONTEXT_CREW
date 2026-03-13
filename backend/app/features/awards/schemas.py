"""Pydantic v2 request/response schemas for the awards feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.enums import (
    AgreementStatus,
    AwardDecision,
    DisbursementTrigger,
    LetterStatus,
)


# ── Requests ─────────────────────────────────────────────────────────────────


class DecisionRequest(BaseModel):
    decision: AwardDecision
    reason: str = Field(min_length=1, max_length=5000)


class TrancheInput(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    amount_inr: Decimal = Field(gt=0)
    trigger_type: DisbursementTrigger
    notes: str | None = Field(default=None, max_length=1000)


class TranchesRequest(BaseModel):
    tranches: list[TrancheInput] = Field(min_length=1)


class GenerateAgreementRequest(BaseModel):
    special_conditions: str | None = Field(default=None, max_length=5000)


class ReleaseTrancheRequest(BaseModel):
    bank_account: str = Field(min_length=1, max_length=50)
    ifsc: str = Field(min_length=11, max_length=11)
    beneficiary_name: str = Field(min_length=1, max_length=255)
    payment_reference: str = Field(min_length=1, max_length=100)


# ── Responses ────────────────────────────────────────────────────────────────


class AwardRecordRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    decided_by: uuid.UUID
    decision: AwardDecision
    reason: str
    award_amount: Decimal | None
    special_conditions: str | None
    decided_at: datetime

    model_config = {"from_attributes": True}


class AwardLetterRead(BaseModel):
    id: uuid.UUID
    award_record_id: uuid.UUID
    letter_type: str
    html_content: str
    status: LetterStatus
    generated_at: datetime
    sent_at: datetime | None

    model_config = {"from_attributes": True}


class AgreementRead(BaseModel):
    id: uuid.UUID
    award_record_id: uuid.UUID
    html_content: str
    special_conditions: str | None
    tranche_summary: dict
    status: AgreementStatus
    generated_at: datetime
    sent_at: datetime | None
    acknowledged_at: datetime | None

    model_config = {"from_attributes": True}


class LetterPreviewResponse(BaseModel):
    html: str
    letter_type: str
    status: LetterStatus


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


class MessageResponse(BaseModel):
    detail: str
