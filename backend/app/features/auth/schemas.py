"""Pydantic v2 request/response schemas for the auth feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.core.enums import OrgType, UserRole


# ── Requests ─────────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    # Organisation (required for applicants)
    legal_name: str = Field(min_length=1, max_length=512)
    registration_number: str | None = Field(default=None, max_length=100)
    org_type: OrgType
    year_established: int | None = None
    state: str | None = Field(default=None, max_length=100)
    annual_budget_inr: Decimal | None = None
    contact_person: str | None = Field(default=None, max_length=255)


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Responses ────────────────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class OrganisationRead(BaseModel):
    id: uuid.UUID
    legal_name: str
    registration_number: str | None
    org_type: OrgType
    year_established: int | None
    state: str | None
    annual_budget_inr: Decimal | None
    contact_person: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserWithOrgRead(UserRead):
    organisation: OrganisationRead | None = None


class MessageResponse(BaseModel):
    detail: str
