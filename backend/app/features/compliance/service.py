"""Compliance service — report submission, review, and AI analysis integration."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from decimal import Decimal

from sqlalchemy import func as sa_func, select
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
from app.features.applications.models import Application, Document
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

    # ── Auditor certificate validation for final reports ─────────────────
    if report_type == ReportType.final:
        # Calculate total award amount from disbursements
        disb_result = await db.execute(
            select(sa_func.coalesce(sa_func.sum(Disbursement.amount_inr), 0))
            .where(Disbursement.application_id == app_id)
        )
        award_amount = disb_result.scalar() or Decimal("0")

        if award_amount > Decimal("1000000"):  # INR 10 lakh
            # Check for auditor_certificate in uploaded documents
            doc_result = await db.execute(
                select(Document)
                .where(Document.application_id == app_id)
                .where(Document.doc_type == "auditor_certificate")
            )
            has_auditor_cert = doc_result.scalar_one_or_none() is not None

            # Also check form_data attachments list
            attachments = form_data.get("attachments", [])
            has_in_attachments = any(
                "auditor_certificate" in str(a).lower()
                for a in attachments
            )

            if not has_auditor_cert and not has_in_attachments:
                raise ValueError(
                    "auditor_certificate_required: "
                    "Final report for grants above INR 10 lakh requires "
                    "a signed Auditor Certificate"
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


async def trigger_milestone_tranches(
    db: AsyncSession,
    app_id: uuid.UUID,
    report: Report,
) -> int:
    """Trigger milestone/mid-project/final tranches based on approved report type.

    Returns the number of tranches flipped to 'ready'.
    """
    tranche_result = await db.execute(
        select(Disbursement).where(
            Disbursement.application_id == app_id,
            Disbursement.status == DisbursementStatus.pending,
        )
    )
    flipped = 0
    for tranche in tranche_result.scalars().all():
        trigger = tranche.trigger_type.value

        # Final tranche: only on final report approval
        if trigger == "final" and report.report_type == ReportType.final:
            tranche.status = DisbursementStatus.ready
            flipped += 1
        # Mid-project and milestone tranches: on any report approval
        elif trigger in ("milestone", "mid_project", "milestone_1", "milestone_2"):
            tranche.status = DisbursementStatus.ready
            flipped += 1

    return flipped


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

        # Trigger appropriate tranches based on report type
        await trigger_milestone_tranches(db, report.application_id, report)

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


# ── Grantee: report schedule ────────────────────────────────────────────────


def _add_months(start: date, months: int) -> date:
    """Add N months to a date, clamping day to valid range."""
    import calendar

    month = start.month - 1 + months
    year = start.year + month // 12
    month = month % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


async def get_report_schedule(
    db: AsyncSession,
    app_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> dict:
    """Compute report schedule for an application based on agreement date."""
    # 1. Get application, verify ownership
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise ValueError("Application not found")
    if application.applicant_id != applicant_id:
        raise ValueError("Not authorized to view schedule for this application")

    valid_statuses = {
        ApplicationStatus.active,
        ApplicationStatus.report_due,
        ApplicationStatus.agreement_acknowledged,
    }
    if application.status not in valid_statuses:
        raise ValueError(
            f"Application must be in {[s.value for s in valid_statuses]} status"
        )

    # 2. Compute 6-month intervals from agreement/updated_at
    start_date: date = application.updated_at.date()
    today = date.today()

    # Generate schedule: progress reports every 6 months for 2 years, then final
    grant_duration_months = 24
    entries: list[dict] = []
    period_num = 1
    current_offset = 6

    while current_offset < grant_duration_months:
        due = _add_months(start_date, current_offset)
        entries.append({
            "report_type": "progress",
            "period_label": f"Progress Report {period_num} (Month {current_offset - 5}-{current_offset})",
            "due_date": due,
            "status": "pending",
        })
        period_num += 1
        current_offset += 6

    # Final report at end of grant period
    final_due = _add_months(start_date, grant_duration_months)
    entries.append({
        "report_type": "final",
        "period_label": f"Final Report (Month {grant_duration_months})",
        "due_date": final_due,
        "status": "pending",
    })

    # 3. Cross-reference with existing reports
    reports_result = await db.execute(
        select(Report)
        .where(Report.application_id == app_id)
        .order_by(Report.submitted_at.asc())
    )
    existing_reports = list(reports_result.scalars().all())

    submitted_periods = {r.period_label for r in existing_reports}

    for entry in entries:
        if entry["period_label"] in submitted_periods:
            entry["status"] = "submitted"
        elif entry["due_date"] < today:
            entry["status"] = "overdue"
        else:
            entry["status"] = "pending"

    return {
        "application_id": app_id,
        "entries": entries,
    }
