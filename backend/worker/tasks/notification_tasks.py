"""Celery tasks for notifications (console-only for hackathon)."""

from __future__ import annotations

import logging
import uuid

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.notification_tasks.task_send_notification")
def task_send_notification(user_id: str, event_type: str, payload: dict) -> dict:
    """Send a notification to a user via console and email if configured."""
    from app.core.config import settings
    from app.core.database import AsyncSessionLocal
    from app.features.auth.models import User
    from app.features.messaging.service import EVENT_TITLES
    import asyncio
    import smtplib
    from email.message import EmailMessage

    async def _get_user_email():
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            result = await db.execute(select(User.email, User.full_name).where(User.id == uuid.UUID(user_id)))
            return result.one_or_none()

    user_info = asyncio.run(_get_user_email())
    if not user_info:
        logger.error("Notification failed: User %s not found", user_id)
        return {"status": "error", "message": "User not found"}

    user_email, user_name = user_info
    title = EVENT_TITLES.get(event_type, event_type.replace("_", " ").title())
    message_body = payload.get("message") or f"You have a new notification: {title}"

    # 1. Console Log (Always)
    print(f"\n{'=' * 60}")
    print(f"  NOTIFICATION")
    print(f"  Recipient: {user_name} <{user_email}>")
    print(f"  Event:     {event_type}")
    print(f"  Title:     {title}")
    print(f"  Body:      {message_body}")
    print(f"{'=' * 60}\n")

    # 2. Email Delivery (If config exists)
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = EmailMessage()
            msg.set_content(f"Hello {user_name},\n\n{message_body}\n\nBest regards,\nThe {settings.PROJECT_NAME} Team")
            msg["Subject"] = f"[{settings.PROJECT_NAME}] {title}"
            msg["From"] = f"{settings.PROJECT_NAME} <{settings.SMTP_USER}>"
            msg["To"] = user_email

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info("Email sent to %s for event %s", user_email, event_type)
            return {"status": "sent", "method": "email", "user_id": user_id}
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", user_email, exc)
            return {"status": "logged_to_console", "error": str(exc), "user_id": user_id}

    logger.info("Notification sent (console only) — user=%s event=%s", user_id, event_type)
    return {"status": "sent_console", "user_id": user_id, "event_type": event_type}


@celery_app.task(name="worker.tasks.notification_tasks.task_report_reminders")
def task_report_reminders() -> dict:
    """Periodic: send reminders for upcoming report deadlines.

    TODO: Query applications in 'active' or 'report_due' status with
    approaching deadlines, dispatch reminder notifications.
    """
    logger.info("Report reminders check running")
    return {"status": "ok", "reminders_sent": 0}


@celery_app.task(name="worker.tasks.notification_tasks.check_overdue_reports")
def check_overdue_reports() -> dict:
    """Periodic (every 3 days): find overdue reports and notify applicant + programme officer.

    A report is considered overdue if the application is in 'report_due' or 'active'
    status and the last report was submitted more than 90 days ago (or no report exists
    and the application has been active for more than 90 days).
    """
    import asyncio

    result = asyncio.get_event_loop().run_until_complete(_check_overdue_reports_async())
    return result


async def _check_overdue_reports_async() -> dict:
    """Async implementation of overdue report check."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.core.database import AsyncSessionLocal
    from app.core.enums import ApplicationStatus, ReportStatus
    from app.features.applications.models import Application
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
                    event_type="overdue_report_alert",
                    payload={
                        "application_id": str(app.id),
                        "reference_number": app.reference_number,
                        "message": "Your progress report is overdue. Please submit at your earliest convenience.",
                    },
                )

                # Notify programme officer (use applicant_id as proxy — in production
                # this would look up the assigned officer)
                task_send_notification.delay(
                    user_id=str(app.programme_id),
                    event_type="overdue_report_alert",
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
