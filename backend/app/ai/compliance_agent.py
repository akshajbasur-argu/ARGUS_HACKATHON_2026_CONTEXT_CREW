"""AI-powered compliance analysis agent — full implementation.

Runs deterministic arithmetic checks + 2 parallel OpenAI calls
(content analysis, financial analysis), then assembles a ComplianceAnalysis.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.openai_client import AIServiceError, call_openai, render_prompt
from app.core.enums import ContentRating, DisbursementStatus, ReportStatus
from app.features.applications.models import Application
from app.features.auth.service import write_audit_log
from app.features.compliance.models import ComplianceAnalysis, Report
from app.features.finance.models import Disbursement
from app.features.programmes.models import GrantProgramme
from app.features.review.models import ReviewPackage

logger = logging.getLogger(__name__)

_SYSTEM_JSON = (
    "You MUST respond with ONLY valid JSON. "
    "No markdown, no commentary, no code fences."
)


# ── Main entry point ────────────────────────────────────────────────────────


async def analyse_report(
    report_id: uuid.UUID,
    db: AsyncSession,
) -> ComplianceAnalysis:
    """Run AI compliance analysis on a submitted awardee report.

    Steps:
      1. Load report, original application, programme, disbursements
      2. Run deterministic arithmetic checks (no LLM)
      3. Run content + financial analysis in parallel (asyncio.gather)
      4. Compute overall rating (worst of content + financial)
      5. Save ComplianceAnalysis
      6. If HIGH severity flag → set disbursement_hold, notify Finance
      7. Notify Programme Officer with summary
    """
    logger.info("COMPLIANCE ANALYSIS START: %s", report_id)

    # ── 1. Load report + application + programme + disbursements ──────────

    report_result = await db.execute(
        select(Report).where(Report.id == report_id)
    )
    report = report_result.scalar_one_or_none()
    if report is None:
        raise ValueError(f"Report {report_id} not found")

    app_result = await db.execute(
        select(Application).where(Application.id == report.application_id)
    )
    application = app_result.scalar_one()

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    disb_result = await db.execute(
        select(Disbursement).where(Disbursement.application_id == application.id)
    )
    disbursements = disb_result.scalars().all()

    # Get the latest review package for the approved application summary
    pkg_result = await db.execute(
        select(ReviewPackage)
        .where(ReviewPackage.application_id == application.id)
        .order_by(ReviewPackage.generated_at.desc())
        .limit(1)
    )
    review_package = pkg_result.scalar_one_or_none()

    form_data: dict = application.form_data or {}
    report_data: dict = report.form_data or {}
    programme_meta: dict = programme.metadata_json or {}

    # Build approved summary context for content analysis
    approved_summary = _build_approved_summary(
        application, programme, form_data, review_package
    )

    # Build financial context
    budget_approved = json.dumps(
        form_data.get("budget", {}), indent=2, default=str
    )
    expenditure_data = json.dumps(
        report_data.get("expenditure", {}), indent=2, default=str
    )
    timeline_json = json.dumps(
        _build_timeline_context(application, report, programme),
        indent=2, default=str
    )
    report_json = json.dumps(report_data, indent=2, default=str)

    # ── 2. Deterministic arithmetic checks ────────────────────────────────

    arith_errors = _run_arithmetic_checks(report_data)

    # ── 3. Content + financial analysis in parallel ───────────────────────

    content_coro = _call_content_analysis(approved_summary, report_json)
    financial_coro = _call_financial_analysis(
        budget_approved, expenditure_data, timeline_json
    )

    content_result, financial_result = await asyncio.gather(
        content_coro,
        financial_coro,
        return_exceptions=True,
    )

    # ── 4. Parse results and compute overall rating ───────────────────────

    # Content analysis
    content_flags: list = []
    content_rating_str = "satisfactory"
    if isinstance(content_result, Exception):
        logger.error("Content analysis failed: %s", content_result)
        content_rating_str = "needs_attention"
        content_flags.append({
            "field": "ai_analysis",
            "issue": "Content analysis unavailable — manual review required",
            "severity": "high",
        })
    else:
        content_rating_str = content_result.get("content_rating", "satisfactory")
        content_flags = content_result.get("content_flags", [])

    # Financial analysis
    financial_flags: list = []
    if isinstance(financial_result, Exception):
        logger.error("Financial analysis failed: %s", financial_result)
        financial_flags.append({
            "field": "ai_analysis",
            "issue": "Financial analysis unavailable — manual review required",
        })
    else:
        financial_flags = financial_result.get("financial_flags", [])

        # Merge budget deviations into flags
        for dev in financial_result.get("budget_deviations", []):
            if abs(dev.get("pct_deviation", 0)) > 10:
                financial_flags.append({
                    "field": dev.get("line", "unknown"),
                    "issue": (
                        f"Budget deviation of {dev['pct_deviation']:.1f}%: "
                        f"approved ₹{dev.get('approved', 0):,.0f}, "
                        f"spent ₹{dev.get('spent', 0):,.0f}"
                        + ("" if dev.get("has_variance_explanation") else " (no variance explanation)")
                    ),
                })

        # Add underspend alert as flag
        if financial_result.get("underspend_alert"):
            financial_flags.append({
                "field": "cumulative_spend",
                "issue": f"Underspend alert: {financial_result.get('underspend_notes', 'Low utilisation at project midpoint')}",
            })

        # Merge deterministic arithmetic errors
        if not financial_result.get("arithmetic_consistent", True):
            for err in financial_result.get("arithmetic_errors", []):
                financial_flags.append({
                    "field": "arithmetic",
                    "issue": err,
                })

    # Also include our deterministic arithmetic errors
    for err in arith_errors:
        financial_flags.append({
            "field": "arithmetic_deterministic",
            "issue": err,
        })

    # Map content_rating string to enum
    rating_map = {
        "satisfactory": ContentRating.satisfactory,
        "needs_clarification": ContentRating.needs_attention,
        "needs_attention": ContentRating.needs_attention,
        "concerns_found": ContentRating.critical,
        "critical": ContentRating.critical,
    }
    content_enum = rating_map.get(content_rating_str, ContentRating.needs_attention)

    # Escalate to critical if any HIGH severity content flag or financial issues
    has_high_severity = any(
        f.get("severity") == "high" for f in content_flags
    )
    has_financial_issues = len(financial_flags) > 0

    if has_high_severity:
        content_enum = ContentRating.critical

    # Build recommended action
    recommended_action = _build_recommended_action(
        content_enum, content_flags, financial_flags, arith_errors
    )

    # ── 5. Save ComplianceAnalysis ────────────────────────────────────────

    analysis = ComplianceAnalysis(
        report_id=report_id,
        content_rating=content_enum,
        financial_flags=financial_flags,
        content_flags=content_flags,
        recommended_action=recommended_action,
    )
    db.add(analysis)

    # Update report status to under_review
    report.status = ReportStatus.under_review
    await db.flush()

    # ── 6. Disbursement hold on HIGH severity ─────────────────────────────

    if has_high_severity or content_enum == ContentRating.critical:
        await _hold_pending_disbursements(db, application.id)
        # Notify finance officer
        _notify_finance_hold(application, analysis)

    # ── 7. Audit log + notify Programme Officer ───────────────────────────

    await write_audit_log(
        db,
        actor_id=None,
        action="compliance_analysis_completed",
        object_type="report",
        object_id=str(report_id),
        metadata={
            "analysis_id": str(analysis.id),
            "content_rating": content_enum.value,
            "content_flags_count": len(content_flags),
            "financial_flags_count": len(financial_flags),
            "arithmetic_errors_count": len(arith_errors),
            "disbursement_hold": has_high_severity or content_enum == ContentRating.critical,
        },
    )

    _notify_programme_officer(application, analysis)

    logger.info(
        "COMPLIANCE ANALYSIS COMPLETE: %s → %s (content_flags=%d, financial_flags=%d)",
        report_id,
        content_enum.value,
        len(content_flags),
        len(financial_flags),
    )
    return analysis


# ── Deterministic arithmetic checks ──────────────────────────────────────────


def _run_arithmetic_checks(report_data: dict) -> list[str]:
    """Check expenditure arithmetic without LLM — pure math."""
    errors: list[str] = []
    expenditure = report_data.get("expenditure", {})

    line_items = expenditure.get("line_items", [])
    reported_total = expenditure.get("total_spent")

    if not line_items or reported_total is None:
        return errors

    # Sum all line item amounts
    try:
        computed_total = sum(
            Decimal(str(item.get("amount", 0))) for item in line_items
        )
        reported_decimal = Decimal(str(reported_total))

        if abs(computed_total - reported_decimal) > Decimal("0.01"):
            errors.append(
                f"Line items sum to ₹{computed_total:,.2f} but reported total is "
                f"₹{reported_decimal:,.2f} (difference: ₹{abs(computed_total - reported_decimal):,.2f})"
            )
    except (ValueError, TypeError) as exc:
        errors.append(f"Could not parse expenditure amounts: {exc}")

    # Check individual line items for negative values
    for item in line_items:
        amount = item.get("amount", 0)
        try:
            if Decimal(str(amount)) < 0:
                errors.append(
                    f"Negative expenditure on '{item.get('name', 'unknown')}': ₹{amount}"
                )
        except (ValueError, TypeError):
            errors.append(
                f"Invalid amount for '{item.get('name', 'unknown')}': {amount}"
            )

    return errors


# ── AI call helpers ──────────────────────────────────────────────────────────


async def _call_content_analysis(
    approved_summary: str, report_json: str
) -> dict:
    """Call OpenAI for content compliance analysis."""
    system = (
        "You are a grant compliance officer reviewing a progress report. "
        "Compare against the approved application. Be factual. " + _SYSTEM_JSON
    )
    user = render_prompt(
        "compliance_content.j2",
        approved_summary=approved_summary,
        report_json=report_json,
    )
    return await call_openai(system, user, max_tokens=2000)


async def _call_financial_analysis(
    budget_approved: str, expenditure_data: str, timeline_json: str
) -> dict:
    """Call OpenAI for financial compliance analysis."""
    system = (
        "You are a grant financial compliance analyst. "
        "Check expenditure against approved budget. Be precise with numbers. "
        + _SYSTEM_JSON
    )
    user = render_prompt(
        "compliance_financial.j2",
        budget_approved=budget_approved,
        expenditure_data=expenditure_data,
        timeline_json=timeline_json,
    )
    return await call_openai(system, user, max_tokens=2000)


# ── Context builders ─────────────────────────────────────────────────────────


def _build_approved_summary(
    application: Application,
    programme: GrantProgramme,
    form_data: dict,
    review_package: ReviewPackage | None,
) -> str:
    """Build a summary of the approved application for comparison."""
    context = {
        "reference_number": application.reference_number,
        "programme": programme.name,
        "project_title": form_data.get("project_title", "Unknown"),
        "proposed_activities": form_data.get("proposed_solution", ""),
        "expected_outcomes": form_data.get("expected_outcomes", ""),
        "target_beneficiaries": form_data.get("target_beneficiaries", ""),
        "budget": form_data.get("budget", {}),
        "duration_months": form_data.get("duration_months"),
    }

    # Include AI-generated summary if available
    if review_package and review_package.summary_text:
        context["ai_review_summary"] = review_package.summary_text

    return json.dumps(context, indent=2, default=str)


def _build_timeline_context(
    application: Application,
    report: Report,
    programme: GrantProgramme,
) -> dict:
    """Build timeline context for financial analysis."""
    form_data = application.form_data or {}
    duration_months = form_data.get(
        "duration_months", programme.duration_max_months
    )

    # Calculate elapsed time
    submitted_at = application.submitted_at
    report_date = report.submitted_at
    elapsed_days = (report_date - submitted_at).days if submitted_at else 0
    elapsed_months = elapsed_days / 30.0

    return {
        "total_duration_months": duration_months,
        "elapsed_months": round(elapsed_months, 1),
        "progress_pct": round(
            (elapsed_months / duration_months * 100) if duration_months else 0, 1
        ),
        "report_period": report.period_label,
    }


def _build_recommended_action(
    rating: ContentRating,
    content_flags: list,
    financial_flags: list,
    arith_errors: list,
) -> str:
    """Generate a recommended action string based on analysis results."""
    if rating == ContentRating.critical:
        return (
            "HOLD: Critical compliance concerns identified. "
            f"{len(content_flags)} content flag(s) and {len(financial_flags)} financial flag(s). "
            "Disbursements should be paused pending officer review. "
            "Recommend requesting clarification from the awardee."
        )
    elif rating == ContentRating.needs_attention:
        return (
            "REVIEW: Some compliance items need attention. "
            f"{len(content_flags)} content flag(s) and {len(financial_flags)} financial flag(s). "
            "Programme officer should review flagged items and request clarifications as needed."
        )
    else:
        action = "APPROVED: Report appears satisfactory."
        if arith_errors:
            action += f" Note: {len(arith_errors)} minor arithmetic discrepancy(ies) detected."
        if financial_flags:
            action += f" {len(financial_flags)} minor financial note(s) for awareness."
        return action


# ── Disbursement hold ────────────────────────────────────────────────────────


async def _hold_pending_disbursements(
    db: AsyncSession, application_id: uuid.UUID
) -> None:
    """Set all pending disbursements to 'pending' (hold) for the application."""
    try:
        await db.execute(
            update(Disbursement)
            .where(Disbursement.application_id == application_id)
            .where(Disbursement.status == DisbursementStatus.ready)
            .values(status=DisbursementStatus.pending)
        )
        logger.info(
            "Disbursement hold applied for application %s", application_id
        )
    except Exception:
        logger.warning(
            "Failed to apply disbursement hold", exc_info=True
        )


# ── Notification helpers ─────────────────────────────────────────────────────


def _notify_finance_hold(
    application: Application, analysis: ComplianceAnalysis
) -> None:
    """Notify finance officer of disbursement hold via Celery."""
    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            user_id="finance_team",
            event_type="disbursement_hold",
            payload={
                "application_id": str(application.id),
                "reference_number": application.reference_number,
                "analysis_id": str(analysis.id),
                "content_rating": analysis.content_rating.value,
                "reason": "High severity compliance flags detected",
            },
        )
    except Exception:
        logger.warning("Failed to notify finance of hold", exc_info=True)


def _notify_programme_officer(
    application: Application, analysis: ComplianceAnalysis
) -> None:
    """Notify programme officer that compliance analysis is ready."""
    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            user_id=str(application.applicant_id),
            event_type="compliance_analysis_ready",
            payload={
                "application_id": str(application.id),
                "reference_number": application.reference_number,
                "analysis_id": str(analysis.id),
                "content_rating": analysis.content_rating.value,
                "content_flags_count": len(analysis.content_flags),
                "financial_flags_count": len(analysis.financial_flags),
                "recommended_action": analysis.recommended_action,
            },
        )
    except Exception:
        logger.warning(
            "Failed to notify programme officer", exc_info=True
        )
