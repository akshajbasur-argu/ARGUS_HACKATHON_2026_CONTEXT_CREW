"""Document vault API endpoints — upload, list, delete."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.features.auth.dependencies import require_role
from app.features.auth.models import User
from app.features.documents.schemas import DocumentRead
from app.features.documents.service import (
    DocumentError,
    delete_vault_document,
    list_vault_documents,
    save_vault_document,
)

router = APIRouter()


# ── POST /vault — upload a document ──────────────────────────────────────────


@router.post(
    "/vault",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_vault_document(
    file: Annotated[UploadFile, File(description="PDF, JPG, or PNG — max 10 MB")],
    doc_type: Annotated[str, Form(description="Document type identifier")],
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DocumentRead:
    """Upload a document to the applicant's personal vault."""
    try:
        doc = await save_vault_document(db, user.id, file, doc_type)
    except DocumentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    await db.commit()
    return DocumentRead(
        id=doc.id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        storage_path=doc.storage_path,
        uploaded_at=doc.uploaded_at,
        is_vault_doc=doc.is_vault_doc,
        application_count=0,
    )


# ── GET /vault — list vault documents ────────────────────────────────────────


@router.get("/vault", response_model=list[DocumentRead])
async def list_my_vault(
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DocumentRead]:
    """List all documents in the current applicant's vault."""
    items = await list_vault_documents(db, user.id)
    return [DocumentRead(**item) for item in items]


# ── DELETE /vault/{id} — remove vault document ──────────────────────────────


@router.delete("/vault/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_vault_document(
    doc_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a document from the applicant's vault."""
    deleted = await delete_vault_document(db, doc_id, user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or not owned by you",
        )
    await db.commit()
