"""Screening service — query reports, record officer decisions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, case, literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ApplicationStatus, ScreeningOutcome
from app.features.applications.models import Application
from app.features.auth.models import User
from app.features.programmes.models import GrantProgramme
from app.features.screening.models import ScreeningReport
from app.features.screening.schemas import (
    HardCheckItem,
    ScreeningDecision,
    ScreeningQueueItem,
    ScreeningReportRead,
    SoftFlagItem,
)


# ── Queue listing ─────────────────────────────────────────────────────────────


async def list_screening_queue(
    db: AsyncSession,
    *,
    pending_only: bool = False,
) -> list[ScreeningQueueItem]:
    """List applications that have been submitted/screened, for the staff queue."""
    # Statuses relevant to screening
    screening_statuses = [
        ApplicationStatus.submitted,
        ApplicationStatus.screening,
        ApplicationStatus.eligible,
        ApplicationStatus.ineligible,
    ]

    q = (
        select(
            Application.id.label("application_id"),
            Application.reference_number,
            GrantProgramme.name.label("programme_name"),
            User.full_name.label("applicant_name"),
            Application.submitted_at,
            ScreeningReport.overall_result.label("screening_status"),
            ScreeningReport.officer_decision,
            case(
                (ScreeningReport.id.isnot(None), literal(True)),
                else_=literal(False),
            ).label("has_report"),
        )
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .join(User, User.id == Application.applicant_id)
        .outerjoin(ScreeningReport, ScreeningReport.application_id == Application.id)
        .where(Application.status.in_(screening_statuses))
        .order_by(Application.submitted_at.asc())
    )

    if pending_only:
        # Only show apps with no officer decision yet
        q = q.where(ScreeningReport.officer_decision.is_(None))

    result = await db.execute(q)
    rows = result.all()

    return [
        ScreeningQueueItem(
            application_id=row.application_id,
            reference_number=row.reference_number,
            programme_name=row.programme_name,
            applicant_name=row.applicant_name,
            submitted_at=row.submitted_at,
            screening_status=row.screening_status,
            officer_decision=row.officer_decision,
            has_report=row.has_report,
        )
        for row in rows
    ]


# ── Get single report ────────────────────────────────────────────────────────


async def get_screening_report(
    db: AsyncSession,
    application_id: uuid.UUID,
) -> ScreeningReportRead | None:
    """Get the full screening report for an application."""
    q = (
        select(
            ScreeningReport,
            Application.reference_number,
            Application.status,
            GrantProgramme.name.label("programme_name"),
            User.full_name.label("applicant_name"),
        )
        .join(Application, Application.id == ScreeningReport.application_id)
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .join(User, User.id == Application.applicant_id)
        .where(ScreeningReport.application_id == application_id)
    )

    result = await db.execute(q)
    row = result.first()
    if row is None:
        return None

    report, ref_number, app_status, prog_name, applicant_name = row

    hard_checks = [
        HardCheckItem(**item) if isinstance(item, dict) else item
        for item in (report.hard_checks or [])
    ]
    soft_flags = [
        SoftFlagItem(**item) if isinstance(item, dict) else item
        for item in (report.soft_flags or [])
    ]

    return ScreeningReportRead(
        id=report.id,
        application_id=report.application_id,
        reference_number=ref_number,
        programme_name=prog_name,
        applicant_name=applicant_name,
        status=app_status,
        hard_checks=hard_checks,
        soft_flags=soft_flags,
        overall_result=report.overall_result,
        ai_thematic_score=report.ai_thematic_score,
        ai_narrative_score=report.ai_narrative_score,
        officer_decision=report.officer_decision,
        officer_notes=report.officer_notes,
        created_at=report.created_at,
        decided_at=report.decided_at,
    )


# ── Record officer decision ──────────────────────────────────────────────────


async def record_decision(
    db: AsyncSession,
    application_id: uuid.UUID,
    data: ScreeningDecision,
) -> ScreeningReportRead | None:
    """Record a programme officer's screening decision."""
    # Load the screening report
    q = select(ScreeningReport).where(ScreeningReport.application_id == application_id)
    result = await db.execute(q)
    report = result.scalar_one_or_none()
    if report is None:
        return None

    # Load the application to update status
    app_q = select(Application).where(Application.id == application_id)
    app_result = await db.execute(app_q)
    application = app_result.scalar_one()

    # Record decision
    report.officer_decision = data.decision
    report.officer_notes = data.reason or data.clarification_question or ""
    report.decided_at = datetime.now(timezone.utc)

    # Update application status
    if data.decision == "eligible":
        application.status = ApplicationStatus.eligible
    elif data.decision == "ineligible":
        application.status = ApplicationStatus.ineligible
    # clarification — keep in screening status

    await db.flush()

    return await get_screening_report(db, application_id)
