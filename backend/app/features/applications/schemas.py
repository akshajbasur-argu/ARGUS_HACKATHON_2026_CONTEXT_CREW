"""Pydantic v2 schemas for the applications feature."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


# ── Chatbot Intake Schemas ───────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=5000)


class ChatIntakeRequest(BaseModel):
    programme_id: uuid.UUID
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    current_field: str | None = None


class FieldCapture(BaseModel):
    field_name: str
    value: Any


class ChatIntakeResponse(BaseModel):
    assistant_message: str
    field_captured: FieldCapture | None = None
    next_field: str | None = None
    progress_pct: int = Field(ge=0, le=100)
    complete: bool = False
