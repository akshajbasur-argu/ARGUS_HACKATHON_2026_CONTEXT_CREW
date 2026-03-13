"""Admin API endpoints — user management and audit log."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_admin
from app.features.auth.models import User
from app.features.auth.service import write_audit_log
from app.features.admin import schemas, service

router = APIRouter()


# ── User management ──────────────────────────────────────────────────────────


@router.get("/users", response_model=list[schemas.UserAdminRead])
async def list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all users (admin only)."""
    users = await service.list_users(db)
    return users


@router.post("/users", response_model=schemas.UserAdminRead, status_code=status.HTTP_201_CREATED)
async def create_staff(
    body: schemas.CreateStaffRequest,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new staff account (admin only)."""
    try:
        user = await service.create_staff_user(
            db,
            full_name=body.full_name,
            email=body.email,
            role=body.role,
            phone=body.phone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await write_audit_log(
        db,
        actor_id=admin.id,
        action="create_staff_account",
        object_type="user",
        object_id=str(user.id),
        metadata={"email": user.email, "role": user.role.value},
    )
    await db.commit()
    return user


@router.patch("/users/{user_id}/deactivate", response_model=schemas.MessageResponse)
async def deactivate_user(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Deactivate a user account (admin only)."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account.",
        )

    try:
        user = await service.deactivate_user(db, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await write_audit_log(
        db,
        actor_id=admin.id,
        action="deactivate_user",
        object_type="user",
        object_id=str(user.id),
        metadata={"email": user.email},
    )
    await db.commit()
    return {"detail": f"User {user.email} has been deactivated."}


# ── Audit log ────────────────────────────────────────────────────────────────


@router.get("/audit-log", response_model=schemas.AuditLogPage)
async def get_audit_log(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    actor_email: str | None = Query(None),
    action: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
):
    """Paginated audit log with filters (admin only)."""
    items, total = await service.list_audit_logs(
        db,
        page=page,
        page_size=page_size,
        actor_email=actor_email,
        action=action,
        date_from=date_from,
        date_to=date_to,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ── Template management ─────────────────────────────────────────────────────


@router.get("/templates", response_model=list[schemas.TemplateRead])
async def list_templates(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all letter templates."""
    templates = await service.list_templates(db)
    if not templates:
        # Seed defaults on first access
        await service.seed_default_templates(db)
        await db.commit()
        templates = await service.list_templates(db)
    return templates


@router.get("/templates/{code}", response_model=schemas.TemplateRead)
async def get_template(
    code: str,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single template by code."""
    template = await service.get_template(db, code)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{code}' not found")
    return template


@router.patch("/templates/{code}", response_model=dict)
async def update_template(
    code: str,
    body: schemas.TemplateUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Update a template's body_text. Validates required merge fields."""
    try:
        success, missing = await service.update_template(db, code, body.body_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    if not success:
        return {"updated": False, "error": f"Missing merge fields: {', '.join('{{' + f + '}}' for f in missing)}", "missing_fields": missing}

    await write_audit_log(
        db,
        actor_id=admin.id,
        action="template_updated",
        object_type="letter_template",
        object_id=code,
    )
    await db.commit()
    return {"updated": True, "missing_fields": []}
