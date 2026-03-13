"""Document vault service — file storage, CRUD, validation."""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.features.applications.models import Document

logger = logging.getLogger(__name__)

# Allowed MIME types → extensions
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}

ALLOWED_DOC_TYPES = {
    "registration_certificate",
    "audited_financials_y1",
    "audited_financials_y2",
    "80g_12a_certificate",
    "fcra_certificate",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class DocumentError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _media_dir(user_id: uuid.UUID) -> Path:
    """Return /media/{user_id}/ path, creating it if needed."""
    p = Path(settings.MEDIA_ROOT) / str(user_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def validate_upload(file: UploadFile, doc_type: str) -> None:
    """Validate file type, size, and doc_type before saving."""
    if doc_type not in ALLOWED_DOC_TYPES:
        raise DocumentError(
            f"Invalid doc_type '{doc_type}'. Allowed: {', '.join(sorted(ALLOWED_DOC_TYPES))}"
        )

    if file.content_type not in ALLOWED_TYPES:
        raise DocumentError(
            f"File type '{file.content_type}' not allowed. "
            f"Accepted: PDF, JPG, PNG"
        )

    # Read size check — seek to end, check position, seek back
    await file.seek(0, 2)  # SEEK_END
    size = file.file.tell()
    await file.seek(0)

    if size > MAX_FILE_SIZE:
        raise DocumentError(
            f"File too large ({size / 1024 / 1024:.1f} MB). Maximum: 10 MB"
        )


async def save_vault_document(
    db: AsyncSession,
    user_id: uuid.UUID,
    file: UploadFile,
    doc_type: str,
) -> Document:
    """Save uploaded file to disk and create DB record."""
    await validate_upload(file, doc_type)

    ext = ALLOWED_TYPES[file.content_type]
    safe_filename = f"{doc_type}_{uuid.uuid4().hex[:8]}{ext}"
    media_dir = _media_dir(user_id)
    disk_path = media_dir / safe_filename

    # Write to disk
    content = await file.read()
    disk_path.write_bytes(content)

    logger.info("Saved vault doc: %s (%d bytes)", disk_path, len(content))

    doc = Document(
        user_id=user_id,
        application_id=None,
        doc_type=doc_type,
        filename=file.filename or safe_filename,
        storage_path=str(disk_path),
        is_vault_doc=True,
    )
    db.add(doc)
    await db.flush()
    return doc


async def list_vault_documents(
    db: AsyncSession, user_id: uuid.UUID
) -> list[dict]:
    """List all vault documents for a user with application usage count."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == user_id)
        .where(Document.is_vault_doc.is_(True))
        .order_by(Document.uploaded_at.desc())
    )
    docs = result.scalars().all()

    items = []
    for doc in docs:
        # Count how many applications reference this doc's type for the user
        count_result = await db.execute(
            select(func.count(Document.id))
            .where(Document.user_id == user_id)
            .where(Document.doc_type == doc.doc_type)
            .where(Document.is_vault_doc.is_(False))
        )
        app_count = count_result.scalar() or 0

        items.append({
            "id": doc.id,
            "doc_type": doc.doc_type,
            "filename": doc.filename,
            "storage_path": doc.storage_path,
            "uploaded_at": doc.uploaded_at,
            "is_vault_doc": doc.is_vault_doc,
            "application_count": app_count,
        })

    return items


async def get_vault_document(
    db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID
) -> Document | None:
    """Get a specific vault document owned by the user."""
    result = await db.execute(
        select(Document)
        .where(Document.id == doc_id)
        .where(Document.user_id == user_id)
        .where(Document.is_vault_doc.is_(True))
    )
    return result.scalar_one_or_none()


async def delete_vault_document(
    db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    """Delete a vault document from disk and DB."""
    doc = await get_vault_document(db, doc_id, user_id)
    if doc is None:
        return False

    # Remove file from disk
    try:
        if os.path.exists(doc.storage_path):
            os.remove(doc.storage_path)
            logger.info("Deleted file: %s", doc.storage_path)
    except OSError:
        logger.warning("Failed to delete file: %s", doc.storage_path, exc_info=True)

    await db.delete(doc)
    await db.flush()
    return True
