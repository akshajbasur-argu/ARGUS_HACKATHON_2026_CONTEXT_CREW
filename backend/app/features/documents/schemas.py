"""Pydantic v2 schemas for document vault."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class DocumentRead(BaseModel):
    id: uuid.UUID
    doc_type: str
    filename: str
    storage_path: str
    uploaded_at: datetime
    is_vault_doc: bool
    application_count: int = 0

    model_config = {"from_attributes": True}
