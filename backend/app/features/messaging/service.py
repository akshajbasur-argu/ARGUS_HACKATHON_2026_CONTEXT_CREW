"""Messaging & Notification service layer."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import UserRole
from app.features.auth.models import User
from app.features.messaging.models import Message, Notification


# ── Notification event titles ────────────────────────────────────────────────

EVENT_TITLES: dict[str, str] = {
    "application_submitted": "Application Submitted",
    "screening_eligible": "Screening Passed",
    "screening_ineligible": "Screening Result",
    "clarification_requested": "Clarification Requested",
    "review_assigned": "Review Assignment",
    "review_due_reminder": "Review Due Reminder",
    "award_approved": "Award Approved",
    "application_rejected": "Application Rejected",
    "agreement_sent": "Agreement Sent",
    "tranche_released": "Tranche Released",
    "report_due_30": "Report Due in 30 Days",
    "report_due_14": "Report Due in 14 Days",
    "report_due_7": "Report Due in 7 Days",
    "report_overdue": "Report Overdue",
    "report_approved": "Report Approved",
    "otp_request": "Account Verification",
    "account_verified": "Welcome to GrantFlow",
    "staff_account_created": "Staff Account Created",
}


# ── Message service ──────────────────────────────────────────────────────────


async def list_messages(
    db: AsyncSession,
    app_id: uuid.UUID,
    *,
    viewer_role: UserRole,
) -> list[dict]:
    """List messages for an application, filtering internal notes for applicants."""
    query = (
        select(Message, User)
        .join(User, Message.sender_id == User.id)
        .where(Message.application_id == app_id)
        .order_by(Message.sent_at.asc())
    )

    if viewer_role == UserRole.applicant:
        query = query.where(Message.is_internal_note.is_(False))

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "id": str(msg.id),
            "application_id": str(msg.application_id),
            "sender_id": str(msg.sender_id),
            "sender_name": user.full_name,
            "sender_role": user.role.value,
            "body": msg.body,
            "is_internal_note": msg.is_internal_note,
            "sent_at": msg.sent_at.isoformat(),
        }
        for msg, user in rows
    ]


async def send_message(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    sender_id: uuid.UUID,
    body: str,
    is_internal_note: bool,
) -> Message:
    """Send a message in an application thread."""
    msg = Message(
        application_id=app_id,
        sender_id=sender_id,
        body=body,
        is_internal_note=is_internal_note,
    )
    db.add(msg)
    await db.flush()
    return msg


# ── Notification service ─────────────────────────────────────────────────────


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    event_type: str,
    body: str,
    payload: dict | None = None,
) -> Notification:
    """Create and store an in-app notification."""
    title = EVENT_TITLES.get(event_type, event_type.replace("_", " ").title())
    notification = Notification(
        user_id=user_id,
        event_type=event_type,
        title=title,
        body=body,
        payload=payload or {},
    )
    db.add(notification)
    await db.flush()
    return notification


async def send_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    event_type: str,
    body: str,
    payload: dict | None = None,
) -> Notification:
    """Store notification in DB and dispatch Celery task for async delivery."""
    notification = await create_notification(
        db, user_id=user_id, event_type=event_type, body=body, payload=payload
    )

    # Fire Celery task for console/email delivery (non-blocking)
    from worker.tasks.notification_tasks import task_send_notification
    task_send_notification.delay(str(user_id), event_type, payload or {})

    return notification


async def list_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[Notification]:
    """List notifications for a user, newest first."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    return list(result.scalars().all())


async def mark_notification_read(
    db: AsyncSession,
    notification_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Notification:
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise ValueError("Notification not found")

    notification.is_read = True
    await db.flush()
    return notification
