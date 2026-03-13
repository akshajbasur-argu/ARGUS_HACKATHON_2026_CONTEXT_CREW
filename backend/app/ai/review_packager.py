"""AI-powered review package generator.

Creates a structured briefing for reviewers: executive summary,
suggested dimension scores, and risk flags — all produced by Claude.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.anthropic_client import AIServiceError, call_claude, render_prompt
from app.features.applications.models import Application
from app.features.programmes.models import GrantProgramme
from app.features.review.models import ReviewPackage

logger = logging.getLogger(__name__)

# ── Default scoring rubric ───────────────────────────────────────────────────

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


async def generate_review_package(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ReviewPackage:
    """Generate an AI briefing package for reviewers."""
    logger.info("REVIEW PACKAGE: %s", application_id)

    # Load application with documents
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
    )
    application = result.scalar_one()

    # Load programme
    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    form = application.form_data or {}
    rubric = get_rubric(programme)

    # Build application text for AI
    application_text = "\n\n".join(
        f"**{k.replace('_', ' ').title()}**: {v}"
        for k, v in form.items()
        if isinstance(v, str) and v.strip()
    )

    # Budget summary
    budget = form.get("budget_breakdown", {})
    budget_total = form.get("budget_total", 0)
    budget_text = "\n".join(
        f"  - {k}: INR {v:,}" if isinstance(v, (int, float)) else f"  - {k}: {v}"
        for k, v in budget.items()
    ) if isinstance(budget, dict) else ""

    doc_list = ", ".join(d.doc_type for d in application.documents) if application.documents else "None"

    # ── AI Summary ──────────────────────────────────────────────────────
    summary_prompt = render_prompt(
        "review_summary.j2",
        application_text=application_text,
        budget_text=budget_text,
        budget_total=budget_total,
        documents=doc_list,
        programme_name=programme.name,
        programme_purpose=programme.purpose or "",
    )

    system_summary = (
        "You are a grant review assistant. Write a concise executive summary for "
        "a reviewer. Return ONLY valid JSON with a single key 'summary'."
    )

    try:
        summary_result = await call_claude(system_summary, summary_prompt, max_tokens=1500)
        summary_text = summary_result.get("summary", "")
    except AIServiceError:
        logger.warning("AI summary failed for %s — using fallback", application_id)
        summary_text = (
            f"Application for {programme.name}. "
            f"Budget: INR {budget_total}. Documents: {doc_list}. "
            "AI summary unavailable — please review application directly."
        )

    # ── AI Scoring ──────────────────────────────────────────────────────
    rubric_text = "\n".join(
        f"- {r['dimension']} ({r['label']}): weight {r['weight']}%"
        for r in rubric
    )

    scoring_prompt = render_prompt(
        "review_scoring.j2",
        application_text=application_text,
        budget_text=budget_text,
        rubric=rubric_text,
        programme_name=programme.name,
    )

    system_scoring = (
        "You are a grant scoring assistant. Score each dimension 1-5 and provide "
        "a brief justification. Also identify risk flags. Return ONLY valid JSON."
    )

    try:
        scoring_result = await call_claude(system_scoring, scoring_prompt, max_tokens=2000)
        suggested_scores = scoring_result.get("scores", {})
        risk_flags = scoring_result.get("risk_flags", [])
    except AIServiceError:
        logger.warning("AI scoring failed for %s — using defaults", application_id)
        suggested_scores = {r["dimension"]: 3.0 for r in rubric}
        risk_flags = [
            {"type": "ai_unavailable", "description": "AI scoring unavailable — manual review required", "severity": "medium"}
        ]

    # Normalise: ensure all rubric dimensions present
    for r in rubric:
        dim = r["dimension"]
        if dim not in suggested_scores:
            suggested_scores[dim] = 3.0

    # ── Persist ──────────────────────────────────────────────────────────
    package = ReviewPackage(
        application_id=application_id,
        summary_text=summary_text,
        suggested_scores=suggested_scores,
        risk_flags=risk_flags,
    )
    db.add(package)
    await db.flush()

    logger.info("REVIEW PACKAGE COMPLETE: %s", application_id)
    return package
