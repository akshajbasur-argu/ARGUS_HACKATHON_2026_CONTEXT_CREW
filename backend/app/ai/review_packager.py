"""AI-powered review package generator."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.review.models import ReviewPackage

logger = logging.getLogger(__name__)


async def generate_review_package(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ReviewPackage:
    """Generate an AI briefing package for reviewers.

    TODO: Replace stub with real AI calls using:
      - render_prompt("review_summary.j2", ...)
      - render_prompt("review_scoring.j2", ...)
      - render_prompt("risk_flags.j2", ...)
      - call_claude(system, user)
    """
    logger.info("REVIEW PACKAGE: %s", application_id)

    package = ReviewPackage(
        application_id=application_id,
        summary_text=(
            "This is a stub AI-generated summary of the application. "
            "It covers the organisation background, proposed activities, "
            "budget justification, and expected outcomes."
        ),
        suggested_scores={
            "relevance": 8.0,
            "feasibility": 7.5,
            "budget_justification": 7.0,
            "impact_potential": 8.5,
            "sustainability": 6.5,
        },
        risk_flags=[
            {
                "type": "budget",
                "description": "Travel costs appear higher than sector average",
                "severity": "medium",
            },
        ],
    )
    db.add(package)
    await db.flush()

    logger.info("REVIEW PACKAGE COMPLETE: %s", application_id)
    return package
