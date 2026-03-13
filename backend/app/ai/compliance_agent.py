"""AI-powered compliance analysis agent."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ContentRating
from app.features.compliance.models import ComplianceAnalysis

logger = logging.getLogger(__name__)


async def analyse_report(
    report_id: uuid.UUID,
    db: AsyncSession,
) -> ComplianceAnalysis:
    """Run AI compliance analysis on a submitted awardee report.

    TODO: Replace stub with real AI calls using:
      - render_prompt("compliance_content.j2", ...)
      - render_prompt("compliance_financial.j2", ...)
      - call_claude(system, user)
    """
    logger.info("COMPLIANCE ANALYSIS: %s", report_id)

    analysis = ComplianceAnalysis(
        report_id=report_id,
        content_rating=ContentRating.satisfactory,
        financial_flags=[],
        content_flags=[
            {
                "key": "vague_outcomes",
                "message": "Reported outcomes lack specific metrics",
                "severity": "low",
            },
        ],
        recommended_action="Approved with minor follow-up on outcome metrics.",
    )
    db.add(analysis)
    await db.flush()

    logger.info("COMPLIANCE ANALYSIS COMPLETE: %s → %s", report_id, analysis.content_rating)
    return analysis
