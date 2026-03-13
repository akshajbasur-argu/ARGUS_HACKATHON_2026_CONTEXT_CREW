"""Admin Pydantic v2 schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.enums import UserRole


# ── User management ──────────────────────────────────────────────────────────


class CreateStaffRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    role: UserRole
    phone: str | None = None


class UserAdminRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Audit log ────────────────────────────────────────────────────────────────


class AuditLogRead(BaseModel):
    id: int
    actor_id: uuid.UUID | None
    actor_email: str | None = None
    action: str
    object_type: str
    object_id: str | None
    metadata_json: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    detail: str


class TemplateRead(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    body_text: str
    required_fields: list[str] = []
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplateUpdate(BaseModel):
    body_text: str = Field(..., min_length=10)
