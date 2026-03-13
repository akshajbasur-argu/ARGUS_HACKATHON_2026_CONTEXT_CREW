"""AI-powered review package generator — full implementation.

Makes 3 parallel OpenAI calls (summary, scoring, risk_flags) via asyncio.gather(),
then assembles and persists a ReviewPackage for reviewer consumption.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.openai_client import call_openai, render_prompt
from app.features.applications.models import Application
from app.features.auth.service import write_audit_log
from app.features.programmes.models import GrantProgramme
from app.features.review.models import ReviewAssignment, ReviewPackage

logger = logging.getLogger(__name__)

_SYSTEM_JSON = (
    "You MUST respond with ONLY valid JSON. "
    "No markdown, no commentary, no code fences."
)

# ── Default scoring rubric (also imported by review service) ─────────────────

DEFAULT_RUBRIC = [
    {"dimension": "relevance", "label": "Thematic Relevance", "weight": 25},
    {"dimension": "feasibility", "label": "Feasibility & Methodology", "weight": 25},
    {"dimension": "budget_justification", "label": "Budget Justification", "weight": 20},
    {"dimension": "impact_potential", "label": "Impact Potential", "weight": 20},
    {"dimension": "sustainability", "label": "Sustainability", "weight": 10},
]


def get_rubric(programme: GrantProgramme) -> list[dict[str, Any]]:
    """Get the scoring rubric from programme metadata or use defaults."""
    meta = programme.metadata_json or {}
    return meta.get("scoring_rubric", DEFAULT_RUBRIC)


# ── Main entry point ────────────────────────────────────────────────────────


async def generate_review_package(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ReviewPackage:
    """Generate an AI briefing package for reviewers.

    Steps:
      1. Load application + programme from DB
      2. Build a full application JSON context
      3. Make 3 parallel OpenAI calls (summary, scoring, risk_flags)
      4. Parse and assemble results
      5. Save ReviewPackage to DB
      6. Notify assigned reviewers
    """
    logger.info("REVIEW PACKAGE START: %s", application_id)

    # ── 1. Load application + programme ─────────────────────────────────────

    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one_or_none()
    if application is None:
        raise ValueError(f"Application {application_id} not found")

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    form_data: dict = application.form_data or {}
    programme_meta: dict = programme.metadata_json or {}

    # ── 2. Build full application JSON context ──────────────────────────────

    full_app_context = {
        "reference_number": application.reference_number,
        "programme_name": programme.name,
        "programme_code": programme.code,
        "form_data": form_data,
        "funding_range_inr": {
            "min": float(programme.funding_min_inr),
            "max": float(programme.funding_max_inr),
        },
        "duration_range_months": {
            "min": programme.duration_min_months,
            "max": programme.duration_max_months,
        },
    }
    full_application_json = json.dumps(full_app_context, indent=2, default=str)

    # Extract budget data for risk_flags prompt
    budget_json = json.dumps(form_data.get("budget", {}), indent=2, default=str)

    # Build rubric JSON from programme metadata
    scoring_rubric = programme_meta.get("scoring_rubric", {})
    rubric_dimensions = scoring_rubric.get("dimensions", [
        {"name": "Relevance", "description": "Alignment with programme goals"},
        {"name": "Feasibility", "description": "Realistic implementation plan"},
        {"name": "Budget Justification", "description": "Cost-effectiveness and clarity"},
        {"name": "Impact Potential", "description": "Scale and depth of expected impact"},
        {"name": "Sustainability", "description": "Continuation after grant period"},
    ])
    rubric_json = json.dumps(rubric_dimensions, indent=2)

    # ── 3. Make 3 parallel OpenAI calls ─────────────────────────────────────

    summary_coro = _call_summary(full_application_json)
    scoring_coro = _call_scoring(programme.name, rubric_json, full_application_json)
    risk_coro = _call_risk_flags(budget_json, full_application_json)

    summary_result, scoring_result, risk_result = await asyncio.gather(
        summary_coro,
        scoring_coro,
        risk_coro,
        return_exceptions=True,
    )

    # ── 4. Parse and assemble results ───────────────────────────────────────

    # Summary
    if isinstance(summary_result, Exception):
        logger.error("Summary call failed: %s", summary_result)
        summary_text = "AI summary unavailable — manual review required."
    else:
        summary_text = json.dumps(summary_result, indent=2)

    # Scoring — preserve full entries with justification and source_section
    suggested_scores: dict = {}
    ai_scores_array: list[dict] = []
    if isinstance(scoring_result, Exception):
        logger.error("Scoring call failed: %s", scoring_result)
    else:
        for entry in scoring_result.get("scores", []):
            dim = entry.get("dimension", "unknown")
            score = entry.get("score", 0)
            justification = entry.get("justification", "")
            source_section = entry.get("evidence_section", entry.get("source_section", ""))
            suggested_scores[dim] = float(score)
            ai_scores_array.append({
                "dimension": dim,
                "score": float(score),
                "justification": justification,
                "source_section": source_section,
            })

    # Risk flags
    if isinstance(risk_result, Exception):
        logger.error("Risk flags call failed: %s", risk_result)
        risk_flags: list = []
    else:
        risk_flags = risk_result.get("risk_flags", [])

    # ── 5. Save ReviewPackage ───────────────────────────────────────────────

    package = ReviewPackage(
        application_id=application_id,
        summary_text=summary_text,
        suggested_scores=suggested_scores,
        ai_scores=ai_scores_array,
        risk_flags=risk_flags,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(package)
    await db.flush()

    # Audit log
    await write_audit_log(
        db,
        actor_id=None,
        action="review_package_generated",
        object_type="application",
        object_id=str(application_id),
        metadata={
            "review_package_id": str(package.id),
            "dimensions_scored": len(suggested_scores),
            "risk_flags_count": len(risk_flags),
        },
    )

    # ── 6. Notify assigned reviewers ────────────────────────────────────────

    await _notify_reviewers(db, application_id, package)

    logger.info(
        "REVIEW PACKAGE COMPLETE: %s (scores=%d dims, flags=%d)",
        application_id,
        len(suggested_scores),
        len(risk_flags),
    )
    return package


# ── Individual OpenAI call helpers ──────────────────────────────────────────


async def _call_summary(full_application_json: str) -> dict:
    """Call OpenAI for structured application summary."""
    system = (
        "You are a grant review analyst preparing a structured briefing for expert reviewers. "
        "Summarise the application concisely and factually. Do not editorialize. " + _SYSTEM_JSON
    )
    user = render_prompt("review_summary.j2", full_application_json=full_application_json)
    return await call_openai(system, user, max_tokens=2000)


async def _call_scoring(programme_name: str, rubric_json: str, full_application_json: str) -> dict:
    """Call OpenAI for dimension-by-dimension scoring."""
    system = (
        "You are a grant scoring expert. Score each dimension on a 1-5 scale using the rubric. "
        "Never score without citing specific application text. " + _SYSTEM_JSON
    )
    user = render_prompt(
        "review_scoring.j2",
        programme_name=programme_name,
        rubric_json=rubric_json,
        full_application_json=full_application_json,
    )
    return await call_openai(system, user, max_tokens=2000)


async def _call_risk_flags(budget_json: str, full_application_json: str) -> dict:
    """Call OpenAI for risk flag identification."""
    system = (
        "You are a grant risk analyst. Identify genuine risks with supporting evidence. "
        "Only flag real concerns — do not invent issues. " + _SYSTEM_JSON
    )
    user = render_prompt(
        "risk_flags.j2",
        budget_json=budget_json,
        full_application_json=full_application_json,
    )
    return await call_openai(system, user, max_tokens=1500)


# ── Reviewer notification ───────────────────────────────────────────────────


async def _notify_reviewers(
    db: AsyncSession,
    application_id: uuid.UUID,
    package: ReviewPackage,
) -> None:
    """Notify all assigned reviewers that the AI package is ready."""
    try:
        result = await db.execute(
            select(ReviewAssignment.reviewer_id)
            .where(ReviewAssignment.application_id == application_id)
            .where(ReviewAssignment.completed_at.is_(None))
        )
        reviewer_ids = result.scalars().all()

        from worker.tasks.notification_tasks import task_send_notification

        for reviewer_id in reviewer_ids:
            task_send_notification.delay(
                user_id=str(reviewer_id),
                event_type="review_package_ready",
                payload={
                    "application_id": str(application_id),
                    "review_package_id": str(package.id),
                },
            )
        logger.info("Notified %d reviewers for application %s", len(reviewer_ids), application_id)
    except Exception:
        logger.warning("Failed to notify reviewers", exc_info=True)
