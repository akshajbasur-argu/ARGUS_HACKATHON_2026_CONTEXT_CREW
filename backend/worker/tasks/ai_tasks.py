"""Celery tasks for AI-powered processing (screening, review, compliance).

All AI agent functions are async. We bridge them into sync Celery tasks
using asyncio.run().
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):  # type: ignore[no-untyped-def]
    """Run an async coroutine from a sync Celery task."""
    return asyncio.run(coro)


async def _screen(application_id: uuid.UUID) -> str:
    from app.core.database import AsyncSessionLocal
    from app.ai.screening_agent import run_screening

    async with AsyncSessionLocal() as db:
        report = await run_screening(application_id, db)
        await db.commit()
    return str(report.id)


async def _review_package(application_id: uuid.UUID) -> str:
    from app.core.database import AsyncSessionLocal
    from app.ai.review_packager import generate_review_package

    async with AsyncSessionLocal() as db:
        package = await generate_review_package(application_id, db)
        await db.commit()
    return str(package.id)


async def _analyse(report_id: uuid.UUID) -> str:
    from app.core.database import AsyncSessionLocal
    from app.ai.compliance_agent import analyse_report

    async with AsyncSessionLocal() as db:
        analysis = await analyse_report(report_id, db)
        await db.commit()
    return str(analysis.id)


# ── Tasks ────────────────────────────────────────────────────────────────────


@celery_app.task(
    name="worker.tasks.ai_tasks.task_screen_application",
    bind=True,
    max_retries=3,
)
def task_screen_application(self, application_id: str) -> dict:  # type: ignore[override]
    """Screen an application using AI agents."""
    logger.info("Task: screening application %s", application_id)
    try:
        report_id = _run_async(_screen(uuid.UUID(application_id)))
        return {"status": "ok", "screening_report_id": report_id}
    except Exception as exc:
        logger.error("Screening failed for %s: %s", application_id, exc)
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@celery_app.task(
    name="worker.tasks.ai_tasks.task_generate_review_package",
    bind=True,
    max_retries=3,
)
def task_generate_review_package(self, application_id: str) -> dict:  # type: ignore[override]
    """Generate an AI review package for an application."""
    logger.info("Task: generating review package for %s", application_id)
    try:
        package_id = _run_async(_review_package(uuid.UUID(application_id)))
        return {"status": "ok", "review_package_id": package_id}
    except Exception as exc:
        logger.error("Review package failed for %s: %s", application_id, exc)
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@celery_app.task(
    name="worker.tasks.ai_tasks.task_analyse_report",
    bind=True,
    max_retries=3,
)
def task_analyse_report(self, report_id: str) -> dict:  # type: ignore[override]
    """Run AI compliance analysis on a submitted report."""
    logger.info("Task: analysing report %s", report_id)
    try:
        analysis_id = _run_async(_analyse(uuid.UUID(report_id)))
        return {"status": "ok", "compliance_analysis_id": analysis_id}
    except Exception as exc:
        logger.error("Compliance analysis failed for %s: %s", report_id, exc)
        raise self.retry(exc=exc, countdown=2**self.request.retries)


# ── Periodic tasks ───────────────────────────────────────────────────────────


@celery_app.task(name="worker.tasks.ai_tasks.task_sla_check")
def task_sla_check() -> dict:
    """Periodic: check applications approaching SLA deadlines.

    TODO: Query applications stuck in screening/review beyond threshold,
    escalate to programme officers.
    """
    logger.info("SLA check running")
    return {"status": "ok", "checked": 0}
