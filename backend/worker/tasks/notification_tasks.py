"""Celery tasks for notifications (console-only for hackathon)."""

from __future__ import annotations

import logging

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Bridge async code into sync Celery tasks."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


async def _persist_notification(user_id: str, event_type: str, payload: dict, body: str | None = None) -> None:
    """Store a notification in the DB so it appears in the user's notification list."""
    import uuid as _uuid

    from app.core.database import AsyncSessionLocal
    from app.features.messaging.service import create_notification

    notification_body = body or payload.get("message", f"Notification: {event_type}")
    async with AsyncSessionLocal() as db:
        await create_notification(
            db,
            user_id=_uuid.UUID(user_id),
            event_type=event_type,
            body=notification_body,
            payload=payload,
        )
        await db.commit()


@celery_app.task(name="worker.tasks.notification_tasks.task_send_notification")
def task_send_notification(user_id: str, event_type: str, payload: dict) -> dict:
    """Send a notification to a user.

    For the hackathon, this prints to console AND persists to DB.
    In production, this would also dispatch to email, SMS, or push notification providers.
    """
    print(f"\n{'=' * 60}")
    print(f"  NOTIFICATION")
    print(f"  User:  {user_id}")
    print(f"  Event: {event_type}")
    print(f"  Data:  {payload}")
    print(f"{'=' * 60}\n")

    # Persist to DB so it appears in GET /api/notifications
    try:
        _run_async(_persist_notification(user_id, event_type, payload))
    except Exception:
        logger.warning("Failed to persist notification to DB", exc_info=True)

    logger.info("Notification sent — user=%s event=%s", user_id, event_type)
    return {"status": "sent", "user_id": user_id, "event_type": event_type}


@celery_app.task(name="worker.tasks.notification_tasks.task_report_reminders")
def task_report_reminders() -> dict:
    """Periodic: send reminders for upcoming report deadlines (30, 14, 7 days)."""
    logger.info("Report reminders check running")
    result = _run_async(_report_reminders_async())
    return result


async def _report_reminders_async() -> dict:
    """Async implementation of report deadline reminders."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.core.enums import ApplicationStatus
    from app.features.applications.models import Application
    from app.features.auth.service import write_audit_log

    now = datetime.now(timezone.utc)
    reminders_sent = 0

    # Reminder windows: (days_before_due, event_type)
    reminder_windows = [
        (30, "report_due_reminder_30"),
        (14, "report_due_reminder_14"),
        (7, "report_due_reminder_7"),
    ]

    async with AsyncSessionLocal() as db:
        # Find applications in active or report_due status
        result = await db.execute(
            select(Application).where(
                Application.status.in_([
                    ApplicationStatus.active,
                    ApplicationStatus.report_due,
                ])
            )
        )
        applications = result.scalars().all()

        for app in applications:
            # Calculate next report due date from form_data or based on grant timeline
            form = app.form_data or {}
            duration_months = form.get("duration_months")
            if not duration_months:
                continue

            # Estimate report due date: submitted_at + (duration/2) for mid-term,
            # or use next_report_due if stored
            next_due_str = form.get("next_report_due")
            if next_due_str:
                try:
                    next_due = datetime.fromisoformat(next_due_str)
                except (ValueError, TypeError):
                    # Fallback: 90 days from last update
                    next_due = app.updated_at + timedelta(days=90)
            else:
                # Default: 90-day report cycle from last status change
                next_due = app.updated_at + timedelta(days=90)

            days_until_due = (next_due - now).days

            for window_days, event_type in reminder_windows:
                # Task runs daily — match if days_until_due is within ±1 of window
                if abs(days_until_due - window_days) <= 1:
                    task_send_notification.delay(
                        user_id=str(app.applicant_id),
                        event_type=event_type,
                        payload={
                            "application_id": str(app.id),
                            "reference_number": app.reference_number,
                            "days_until_due": days_until_due,
                            "message": f"Your progress report is due in {days_until_due} days.",
                        },
                    )

                    await write_audit_log(
                        db,
                        actor_id=None,
                        action=f"report_reminder_{window_days}d_sent",
                        object_type="application",
                        object_id=str(app.id),
                        metadata={
                            "reference_number": app.reference_number,
                            "days_until_due": days_until_due,
                        },
                    )
                    reminders_sent += 1
                    break  # Only send one reminder per application per run

        await db.commit()

    logger.info("Report reminders check complete: %d reminders sent", reminders_sent)
    return {"status": "ok", "reminders_sent": reminders_sent}


@celery_app.task(name="worker.tasks.notification_tasks.check_overdue_reports")
def check_overdue_reports() -> dict:
    """Periodic (every 3 days): find overdue reports and notify applicant + programme officer.

    A report is considered overdue if the application is in 'report_due' or 'active'
    status and the last report was submitted more than 90 days ago (or no report exists
    and the application has been active for more than 90 days).
    """
    result = _run_async(_check_overdue_reports_async())
    return result


async def _check_overdue_reports_async() -> dict:
    """Async implementation of overdue report check."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.core.enums import ApplicationStatus, ReportStatus, UserRole
    from app.features.applications.models import Application
    from app.features.auth.models import User
    from app.features.auth.service import write_audit_log
    from app.features.compliance.models import Report

    overdue_threshold = timedelta(days=90)
    now = datetime.now(timezone.utc)
    notifications_sent = 0

    async with AsyncSessionLocal() as db:
        # Find applications in report_due or active status
        result = await db.execute(
            select(Application).where(
                Application.status.in_([
                    ApplicationStatus.active,
                    ApplicationStatus.report_due,
                ])
            )
        )
        applications = result.scalars().all()

        # Find programme officers for notification
        po_result = await db.execute(
            select(User).where(User.role == UserRole.program_officer, User.is_active.is_(True))
        )
        programme_officers = po_result.scalars().all()

        for app in applications:
            # Check the most recent report for this application
            report_result = await db.execute(
                select(Report)
                .where(Report.application_id == app.id)
                .order_by(Report.submitted_at.desc())
                .limit(1)
            )
            last_report = report_result.scalar_one_or_none()

            is_overdue = False
            if last_report is None:
                # No reports ever submitted — check if app has been active long enough
                if (now - app.updated_at) > overdue_threshold:
                    is_overdue = True
            elif last_report.status != ReportStatus.submitted:
                # Last report exists but was not recently submitted
                if (now - last_report.submitted_at) > overdue_threshold:
                    is_overdue = True

            if is_overdue:
                # Notify applicant
                task_send_notification.delay(
                    user_id=str(app.applicant_id),
                    event_type="report_overdue",
                    payload={
                        "application_id": str(app.id),
                        "reference_number": app.reference_number,
                        "message": "Your progress report is overdue. Please submit at your earliest convenience.",
                    },
                )

                # Notify all programme officers
                for po in programme_officers:
                    task_send_notification.delay(
                        user_id=str(po.id),
                        event_type="report_overdue",
                        payload={
                            "application_id": str(app.id),
                            "reference_number": app.reference_number,
                            "message": f"Application {app.reference_number} has an overdue report.",
                        },
                    )

                # Audit log
                await write_audit_log(
                    db,
                    actor_id=None,
                    action="overdue_report_alert_sent",
                    object_type="application",
                    object_id=str(app.id),
                    metadata={
                        "reference_number": app.reference_number,
                        "last_report_at": str(last_report.submitted_at) if last_report else None,
                    },
                )
                notifications_sent += 1

        await db.commit()

    logger.info("Overdue report check complete: %d notifications sent", notifications_sent)
    return {"status": "ok", "notifications_sent": notifications_sent}
