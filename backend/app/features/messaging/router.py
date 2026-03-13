"""Messaging & Notification API endpoints."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.features.auth.dependencies import require_auth
from app.features.auth.models import User
from app.features.auth.service import write_audit_log
from app.features.messaging import schemas, service

router = APIRouter()


# ── Messages ─────────────────────────────────────────────────────────────────


@router.get("/messages/{app_id}", response_model=list[schemas.MessageRead])
async def get_messages(
    app_id: uuid.UUID,
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get message thread for an application."""
    messages = await service.list_messages(db, app_id, viewer_role=user.role)
    return messages


@router.post("/messages/{app_id}", response_model=schemas.MessageRead)
async def post_message(
    app_id: uuid.UUID,
    body: schemas.MessageSendRequest,
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a message in an application thread."""
    # Only staff roles can create internal notes
    if body.is_internal_note and user.role == UserRole.applicant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Applicants cannot create internal notes.",
        )

    msg = await service.send_message(
        db,
        app_id=app_id,
        sender_id=user.id,
        body=body.body,
        is_internal_note=body.is_internal_note,
    )

    # Send notification to recipient if external message
    if not body.is_internal_note:
        from app.features.applications.models import Application
        from sqlalchemy import select

        app_result = await db.execute(
            select(Application).where(Application.id == app_id)
        )
        application = app_result.scalar_one_or_none()
        if application:
            # If sender is applicant, notify the programme officer (skip for now — no officer FK on app)
            # If sender is staff, notify the applicant
            if user.role != UserRole.applicant:
                await service.send_notification(
                    db,
                    user_id=application.applicant_id,
                    event_type="message_received",
                    body=f"New message from {user.full_name} on your application.",
                    payload={"application_id": str(app_id), "message_id": str(msg.id)},
                )

    await write_audit_log(
        db,
        actor_id=user.id,
        action="message_sent",
        object_type="message",
        object_id=str(msg.id),
        metadata={"application_id": str(app_id), "is_internal_note": body.is_internal_note},
    )
    await db.commit()

    return {
        "id": msg.id,
        "application_id": msg.application_id,
        "sender_id": msg.sender_id,
        "sender_name": user.full_name,
        "sender_role": user.role.value,
        "body": msg.body,
        "is_internal_note": msg.is_internal_note,
        "sent_at": msg.sent_at,
    }


# ── Notifications ────────────────────────────────────────────────────────────


@router.get("/notifications", response_model=list[schemas.NotificationRead])
async def get_notifications(
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List notifications for the current user."""
    notifications = await service.list_notifications(db, user.id)
    return notifications


@router.post("/notifications/{notification_id}/read", response_model=schemas.MessageResponse)
async def mark_read(
    notification_id: uuid.UUID,
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a notification as read."""
    try:
        await service.mark_notification_read(db, notification_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    await db.commit()
    return {"detail": "Notification marked as read."}
