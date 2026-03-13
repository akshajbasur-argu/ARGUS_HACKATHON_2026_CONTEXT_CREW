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
