"""Compliance service — report submission, review, and AI analysis integration."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    ApplicationStatus,
    ComplianceAction,
    ComplianceSeverity,
    DisbursementStatus,
    ReportStatus,
    ReportType,
)
from app.features.applications.models import Application
from app.features.compliance.models import ComplianceAnalysis, Report
from app.features.finance.models import Disbursement


# ── Grantee: report queries ──────────────────────────────────────────────────


async def list_grantee_reports(db: AsyncSession, applicant_id: uuid.UUID) -> list[Report]:
    """List reports for applications owned by this applicant."""
    result = await db.execute(
        select(Report)
        .join(Application, Report.application_id == Application.id)
        .where(Application.applicant_id == applicant_id)
        .order_by(Report.submitted_at.desc())
    )
    return list(result.scalars().all())


async def submit_report(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    applicant_id: uuid.UUID,
    report_type: ReportType,
    period_label: str,
    form_data: dict,
) -> Report:
    """Submit a progress or final report for an application."""
    # Validate application ownership and status
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise ValueError("Application not found")
    if application.applicant_id != applicant_id:
        raise ValueError("Not authorized to submit reports for this application")

    valid_statuses = {
        ApplicationStatus.active,
        ApplicationStatus.report_due,
        ApplicationStatus.agreement_acknowledged,
    }
    if application.status not in valid_statuses:
        raise ValueError(
            f"Application must be in {[s.value for s in valid_statuses]} status"
        )

    report = Report(
        application_id=app_id,
        report_type=report_type,
        period_label=period_label,
        form_data=form_data,
    )
    db.add(report)

    # Update application status to report_due if active
    if application.status == ApplicationStatus.active:
        application.status = ApplicationStatus.report_due

    await db.flush()
    return report


# ── Staff: compliance queries ────────────────────────────────────────────────


async def list_pending_reports(db: AsyncSession) -> list[Report]:
    """List reports pending staff review."""
    result = await db.execute(
        select(Report)
        .where(Report.status.in_([ReportStatus.submitted, ReportStatus.under_review]))
        .order_by(Report.submitted_at.asc())
    )
    return list(result.scalars().all())


async def get_report_with_analysis(db: AsyncSession, report_id: uuid.UUID) -> Report | None:
    """Get report with its AI compliance analysis loaded."""
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.compliance_analysis))
        .where(Report.id == report_id)
    )
    return result.scalar_one_or_none()


async def decide_report(
    db: AsyncSession,
    *,
    report_id: uuid.UUID,
    action: ComplianceAction,
    severity: ComplianceSeverity | None,
    notes: str,
) -> Report:
    """Programme officer decides on a compliance report."""
    report = await get_report_with_analysis(db, report_id)
    if report is None:
        raise ValueError("Report not found")

    now = datetime.now(timezone.utc)

    if action == ComplianceAction.approved:
        report.status = ReportStatus.approved
        report.reviewed_at = now

        # Trigger any ready milestone tranches for this application
        tranche_result = await db.execute(
            select(Disbursement).where(
                Disbursement.application_id == report.application_id,
                Disbursement.status == DisbursementStatus.pending,
            )
        )
        for tranche in tranche_result.scalars().all():
            # Mark milestone/mid_project tranches as ready on report approval
            if tranche.trigger_type.value in ("milestone", "mid_project", "milestone_1", "milestone_2"):
                tranche.status = DisbursementStatus.ready

    elif action == ComplianceAction.clarification:
        report.status = ReportStatus.under_review
        report.reviewed_at = now

    elif action == ComplianceAction.compliance_action:
        report.status = ReportStatus.rejected
        report.reviewed_at = now

        # If severity is disbursement_hold, freeze pending tranches
        if severity == ComplianceSeverity.disbursement_hold:
            tranche_result = await db.execute(
                select(Disbursement).where(
                    Disbursement.application_id == report.application_id,
                    Disbursement.status == DisbursementStatus.ready,
                )
            )
            for tranche in tranche_result.scalars().all():
                tranche.status = DisbursementStatus.pending

    # Store decision notes in form_data
    existing_data = report.form_data or {}
    existing_data["_review_notes"] = notes
    existing_data["_review_action"] = action.value
    if severity:
        existing_data["_review_severity"] = severity.value
    report.form_data = existing_data

    await db.flush()
    return report
