"""AI-powered application screening agent."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ScreeningOutcome
from app.features.screening.models import ScreeningReport

logger = logging.getLogger(__name__)


async def run_screening(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ScreeningReport:
    """Run AI screening checks on an application.

    TODO: Replace stub with real AI calls using:
      - render_prompt("screening_hard_check.j2", ...)
      - render_prompt("screening_soft_check.j2", ...)
      - call_claude(system, user)
    """
    logger.info("SCREENING: %s", application_id)

    report = ScreeningReport(
        application_id=application_id,
        hard_checks={
            "organisation_registered": True,
            "budget_within_range": True,
            "required_documents_present": True,
        },
        soft_flags=[
            {
                "key": "first_time_applicant",
                "message": "Organisation has no prior grant history",
                "severity": "low",
            },
        ],
        overall_result=ScreeningOutcome.eligible,
        ai_thematic_score=Decimal("7.50"),
        ai_narrative_score=Decimal("8.00"),
    )
    db.add(report)
    await db.flush()

    logger.info("SCREENING COMPLETE: %s → %s", application_id, report.overall_result)
    return report
