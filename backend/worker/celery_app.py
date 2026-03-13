"""Celery application with Redis broker/backend and beat schedule."""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "grantflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "worker.tasks",
        "worker.tasks.ai_tasks",
        "worker.tasks.notification_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,  # 1 hour
)

# ── Beat schedule ────────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    "sla-check": {
        "task": "worker.tasks.ai_tasks.task_sla_check",
        "schedule": 3600.0,  # every 1 hour
    },
    "report-reminders": {
        "task": "worker.tasks.notification_tasks.task_report_reminders",
        "schedule": crontab(hour=8, minute=0),  # every day at 08:00 UTC
    },
}
