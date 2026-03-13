"""Messaging & Notification Pydantic v2 schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Message schemas ──────────────────────────────────────────────────────────


class MessageSendRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    is_internal_note: bool = False


class MessageRead(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    sender_role: str
    body: str
    is_internal_note: bool
    sent_at: datetime

    model_config = {"from_attributes": True}


# ── Notification schemas ─────────────────────────────────────────────────────


class NotificationRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    title: str
    body: str
    payload: dict
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    detail: str
