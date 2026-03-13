"""Compliance API endpoints — report submission, review, and AI analysis."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_applicant, require_program_officer
from app.features.auth.models import User
from app.features.auth.service import write_audit_log
from app.features.compliance.schemas import (
    ComplianceDecisionRequest,
    MessageResponse,
    ReportRead,
    ReportScheduleResponse,
    ReportSubmitRequest,
    ReportWithAnalysisRead,
)
from app.features.compliance.service import (
    decide_report,
    get_report_schedule,
    get_report_with_analysis,
    list_grantee_reports,
    list_pending_reports,
    submit_report,
)

router = APIRouter()


# ── GET /grantee/reports — my pending reports ────────────────────────────────


@router.get("/grantee/reports", response_model=list[ReportRead])
async def my_reports(
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List reports for the current applicant's applications."""
    return await list_grantee_reports(db, applicant.id)


# ── POST /grantee/reports/{app_id} — submit report ──────────────────────────


@router.post(
    "/grantee/reports/{app_id}",
    response_model=ReportRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_report_endpoint(
    app_id: uuid.UUID,
    body: ReportSubmitRequest,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit a progress or final report for an application."""
    try:
        report = await submit_report(
            db,
            app_id=app_id,
            applicant_id=applicant.id,
            report_type=body.report_type,
            period_label=body.period_label,
            form_data=body.form_data,
        )
    except ValueError as e:
        msg = str(e)
        if msg.startswith("auditor_certificate_required:"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "auditor_certificate_required",
                    "message": msg.split(":", 1)[1].strip(),
                },
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    await write_audit_log(
        db,
        actor_id=applicant.id,
        action="report_submitted",
        object_type="report",
        object_id=str(report.id),
        metadata={"report_type": body.report_type.value, "period": body.period_label},
    )
    await db.commit()

    # Trigger AI analysis asynchronously
    try:
        from worker.tasks.ai_tasks import task_analyse_report

        task_analyse_report.delay(str(report.id))
    except Exception:
        pass  # Non-critical

    return report


# ── GET /grantee/reports/schedule/{app_id} — report schedule ─────────────────


@router.get("/grantee/reports/schedule/{app_id}", response_model=ReportScheduleResponse)
async def report_schedule(
    app_id: uuid.UUID,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the report schedule for an application."""
    try:
        schedule = await get_report_schedule(db, app_id=app_id, applicant_id=applicant.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return schedule


# ── GET /staff/reports — reports pending review ──────────────────────────────


@router.get("/staff/reports", response_model=list[ReportRead])
async def staff_pending_reports(
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List reports pending compliance review."""
    return await list_pending_reports(db)


# ── GET /staff/reports/{report_id} — report + AI analysis ───────────────────


@router.get("/staff/reports/{report_id}", response_model=ReportWithAnalysisRead)
async def staff_report_detail(
    report_id: uuid.UUID,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a report with its AI compliance analysis."""
    report = await get_report_with_analysis(db, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


# ── POST /staff/reports/{report_id}/decide ───────────────────────────────────


@router.post("/staff/reports/{report_id}/decide", response_model=ReportRead)
async def decide_report_endpoint(
    report_id: uuid.UUID,
    body: ComplianceDecisionRequest,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Programme officer decides on a compliance report."""
    try:
        report = await decide_report(
            db,
            report_id=report_id,
            action=body.action,
            severity=body.severity,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action=f"compliance_{body.action.value}",
        object_type="report",
        object_id=str(report_id),
        metadata={"action": body.action.value, "severity": body.severity.value if body.severity else None},
    )

    # Notify grantee (persisted to DB)
    from app.features.messaging.service import send_notification
    from sqlalchemy import select
    from app.features.applications.models import Application

    app_result = await db.execute(
        select(Application).where(Application.id == report.application_id)
    )
    application = app_result.scalar_one_or_none()

    if application:
        action_val = body.action.value
        if action_val == "approved":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="report_approved",
                body=f"Your compliance report for application {application.reference_number} has been approved.",
                payload={"application_id": str(report.application_id), "report_id": str(report_id)},
            )
        elif action_val == "clarification":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="compliance_clarification",
                body=f"Clarification needed on your report for application {application.reference_number}: {body.notes}",
                payload={"application_id": str(report.application_id), "report_id": str(report_id), "notes": body.notes},
            )
        elif action_val == "compliance_action":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="compliance_compliance_action",
                body=f"Compliance action taken on your report for application {application.reference_number}.",
                payload={"application_id": str(report.application_id), "report_id": str(report_id), "notes": body.notes},
            )

            # If severity is disbursement_hold, also notify finance officers
            if body.severity and body.severity.value == "disbursement_hold":
                from app.features.auth.models import User as _CFUser
                from app.core.enums import UserRole as _CFUR

                fo_result = await db.execute(
                    select(_CFUser).where(_CFUser.role == _CFUR.finance_officer, _CFUser.is_active.is_(True))
                )
                for fo in fo_result.scalars().all():
                    await send_notification(
                        db,
                        user_id=fo.id,
                        event_type="disbursement_hold",
                        body=f"Disbursement hold applied to application {application.reference_number} due to compliance action.",
                        payload={
                            "application_id": str(report.application_id),
                            "report_id": str(report_id),
                            "severity": "disbursement_hold",
                        },
                    )

    await db.commit()

    return report
