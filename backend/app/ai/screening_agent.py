"""AI-powered application screening agent — full implementation."""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.anthropic_client import AIServiceError, call_claude, render_prompt
from app.ai.hard_checks import all_hard_checks_passed, run_hard_checks
from app.core.enums import ApplicationStatus, ScreeningOutcome
from app.features.applications.models import Application, Document
from app.features.auth.service import write_audit_log
from app.features.programmes.models import GrantProgramme
from app.features.screening.models import ScreeningReport

logger = logging.getLogger(__name__)

# Default thematic threshold percentage — overridden by programme metadata
_DEFAULT_THRESHOLD_PCT = 50


# ── Main entry point ────────────────────────────────────────────────────────


async def run_screening(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ScreeningReport:
    """Run the full screening pipeline on an application.

    Steps:
      1. Load application + programme from DB
      2. Run deterministic hard checks
      3. Call AI for soft (thematic/narrative) evaluation
      4. Compute overall screening result
      5. Save ScreeningReport + update application status
      6. Write audit log + trigger notification
    """
    logger.info("SCREENING START: %s", application_id)

    # ── 1. Load application + programme ─────────────────────────────────────

    app_result = await db.execute(
        select(Application)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
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

    # ── 2. Run hard checks ──────────────────────────────────────────────────

    doc_count_result = await db.execute(
        select(Document).where(Document.application_id == application_id)
    )
    doc_count = len(doc_count_result.scalars().all())

    # Check if org has a registration number
    from app.features.auth.models import Organisation

    org_result = await db.execute(
        select(Organisation).where(Organisation.user_id == application.applicant_id)
    )
    org = org_result.scalar_one_or_none()
    has_reg = bool(org and org.registration_number)

    hard_checks = run_hard_checks(
        form_data=form_data,
        programme_meta=programme_meta,
        funding_min=programme.funding_min_inr,
        funding_max=programme.funding_max_inr,
        duration_min=programme.duration_min_months,
        duration_max=programme.duration_max_months,
        has_registration_number=has_reg,
        document_count=doc_count,
    )

    # ── 3. AI soft check (thematic + narrative evaluation) ──────────────────

    # Extract scoring threshold from programme metadata
    scoring_rubric = programme_meta.get("scoring_rubric", {})
    threshold_pct = scoring_rubric.get("pass_threshold", _DEFAULT_THRESHOLD_PCT)

    ai_result = await _run_soft_check(
        form_data=form_data,
        grant_type=programme.name,
        threshold_pct=threshold_pct,
    )

    thematic_score = Decimal(str(ai_result.get("thematic_score", 0)))
    narrative_score = Decimal(str(ai_result.get("narrative_coherence_score", 0)))
    soft_flags = ai_result.get("soft_flags", [])

    # Augment soft flags with additional AI insights
    if not ai_result.get("has_measurable_outcome", True):
        soft_flags.append({
            "flag_type": "unmeasurable_outcomes",
            "description": "Application lacks concrete measurable outcome indicators",
            "severity": "medium",
        })

    beneficiary_spec = ai_result.get("beneficiary_specificity", "vague")
    if beneficiary_spec in ("vague", "absent"):
        soft_flags.append({
            "flag_type": f"beneficiary_{beneficiary_spec}",
            "description": f"Target beneficiaries are {beneficiary_spec}",
            "severity": "medium" if beneficiary_spec == "vague" else "high",
        })

    # ── 4. Compute overall result ───────────────────────────────────────────

    if not all_hard_checks_passed(hard_checks):
        overall = ScreeningOutcome.ineligible
        new_status = ApplicationStatus.ineligible
    elif thematic_score < threshold_pct:
        # Below threshold — don't auto-reject, flag for officer review
        overall = ScreeningOutcome.needs_review
        new_status = ApplicationStatus.screening
    else:
        overall = ScreeningOutcome.eligible
        new_status = ApplicationStatus.eligible

    # ── 5. Save ScreeningReport + update application status ─────────────────

    report = ScreeningReport(
        application_id=application_id,
        hard_checks=hard_checks,
        soft_flags=soft_flags,
        overall_result=overall,
        ai_thematic_score=thematic_score,
        ai_narrative_score=narrative_score,
    )
    db.add(report)

    application.status = new_status
    await db.flush()

    # ── 6. Audit log + notification ─────────────────────────────────────────

    await write_audit_log(
        db,
        actor_id=None,  # system action
        action="screening_completed",
        object_type="application",
        object_id=str(application_id),
        metadata={
            "screening_report_id": str(report.id),
            "overall_result": overall.value,
            "thematic_score": float(thematic_score),
            "narrative_score": float(narrative_score),
            "hard_checks_passed": all_hard_checks_passed(hard_checks),
        },
    )

    # Trigger async notification to programme officers
    _notify_screening_complete(application, report)

    logger.info(
        "SCREENING COMPLETE: %s -> %s (thematic=%s, narrative=%s)",
        application_id,
        overall.value,
        thematic_score,
        narrative_score,
    )
    return report


# ── AI soft check with retry ────────────────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an expert grant evaluator AI. "
    "You MUST respond with ONLY valid JSON matching the requested schema. "
    "No markdown, no commentary, no code fences."
)


async def _run_soft_check(
    form_data: dict,
    grant_type: str,
    threshold_pct: int,
) -> dict:
    """Call Claude for thematic/narrative evaluation with retry on bad JSON."""

    user_prompt = render_prompt(
        "screening_soft_check.j2",
        project_title=form_data.get("project_title", "Untitled"),
        problem_statement=form_data.get("problem_statement", "Not provided"),
        proposed_solution=form_data.get("proposed_solution", "Not provided"),
        expected_outcomes=form_data.get("expected_outcomes", "Not provided"),
        target_beneficiaries=form_data.get("target_beneficiaries", ""),
        grant_type=grant_type,
        threshold_pct=threshold_pct,
    )

    # First attempt
    try:
        return await call_claude(_SYSTEM_PROMPT, user_prompt, max_tokens=1500)
    except AIServiceError as exc:
        if "invalid JSON" not in str(exc):
            raise
        logger.warning("First AI call returned invalid JSON — retrying with stricter prompt")

    # Retry with stricter instructions
    strict_suffix = (
        "\n\nCRITICAL: Your previous response was not valid JSON. "
        "You MUST return ONLY a raw JSON object. "
        "Do NOT wrap in markdown code fences. Do NOT add any text before or after the JSON."
    )
    try:
        return await call_claude(
            _SYSTEM_PROMPT,
            user_prompt + strict_suffix,
            max_tokens=1500,
            temperature=0.1,
        )
    except AIServiceError:
        logger.error("AI retry also failed — falling back to manual review")
        return _fallback_result()


def _fallback_result() -> dict:
    """Fallback when AI is unavailable — requires manual review."""
    return {
        "thematic_score": 0,
        "thematic_reasoning": "AI evaluation unavailable — manual review required",
        "narrative_coherence_score": 0,
        "narrative_reasoning": "AI evaluation unavailable — manual review required",
        "has_measurable_outcome": False,
        "beneficiary_specificity": "absent",
        "soft_flags": [
            {
                "flag_type": "ai_unavailable",
                "description": "Automated evaluation failed; application requires full manual review",
                "severity": "high",
            },
        ],
    }


# ── Notification helper ─────────────────────────────────────────────────────


def _notify_screening_complete(application: Application, report: ScreeningReport) -> None:
    """Fire-and-forget Celery task to notify programme officers."""
    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            user_id=str(application.applicant_id),
            event_type="screening_completed",
            payload={
                "application_id": str(application.id),
                "reference_number": application.reference_number,
                "result": report.overall_result.value,
            },
        )
    except Exception:
        # Don't let notification failure break the screening flow
        logger.warning("Failed to dispatch screening notification", exc_info=True)
