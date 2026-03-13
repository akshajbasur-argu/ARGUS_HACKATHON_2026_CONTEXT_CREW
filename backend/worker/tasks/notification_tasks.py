"""Celery tasks for notifications (console-only for hackathon)."""

from __future__ import annotations

import logging

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.notification_tasks.task_send_notification")
def task_send_notification(user_id: str, event_type: str, payload: dict) -> dict:
    """Send a notification to a user.

    For the hackathon, this prints to console. In production, this would
    dispatch to email, SMS, or push notification providers.
    """
    print(f"\n{'=' * 60}")
    print(f"  NOTIFICATION")
    print(f"  User:  {user_id}")
    print(f"  Event: {event_type}")
    print(f"  Data:  {payload}")
    print(f"{'=' * 60}\n")

    logger.info("Notification sent — user=%s event=%s", user_id, event_type)
    return {"status": "sent", "user_id": user_id, "event_type": event_type}


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
