"""AI-powered application screening agent.

Runs hard eligibility checks (rule-based) and soft quality checks (AI-assisted)
for each grant programme. Creates a ScreeningReport with pass/fail gates,
thematic/narrative scores, and soft flags.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.openai_client import AIServiceError, call_openai, render_prompt
from app.core.enums import ApplicationStatus, ScreeningOutcome
from app.features.applications.models import Application
from app.features.auth.models import Organisation
from app.features.auth.service import write_audit_log
from app.features.programmes.models import GrantProgramme
from app.features.screening.models import ScreeningReport

logger = logging.getLogger(__name__)

# Default thematic threshold percentage — overridden by programme metadata
_DEFAULT_THRESHOLD_PCT = 50


# ── Types ────────────────────────────────────────────────────────────────────


class CheckResult:
    """One hard-check evaluation result."""

    __slots__ = ("rule_code", "passed", "detail")

    def __init__(self, rule_code: str, passed: bool, detail: str) -> None:
        self.rule_code = rule_code
        self.passed = passed
        self.detail = detail

    def to_dict(self) -> dict[str, Any]:
        return {"rule_code": self.rule_code, "passed": self.passed, "detail": self.detail}


# ── Indian rural districts (sample set for CDG E3) ──────────────────────────

RURAL_DISTRICTS = {
    "bastar", "dantewada", "korba", "jashpur", "narayanpur",
    "kalahandi", "nuapada", "malkangiri", "koraput", "rayagada",
    "champhai", "lawngtlai", "serchhip", "mamit",
    "nandurbar", "washim", "gadchiroli", "hingoli",
    "shravasti", "balrampur", "bahraich", "sonbhadra",
    "purnia", "kishanganj", "araria", "katihar",
    "pakur", "sahibganj", "dumka", "godda",
}


# ── Hard-check helpers ───────────────────────────────────────────────────────


def _get_form(app: Application) -> dict[str, Any]:
    return app.form_data or {}


def _get_budget(form: dict[str, Any]) -> dict[str, Decimal]:
    raw = form.get("budget_breakdown", {})
    if not isinstance(raw, dict):
        return {}
    return {k: Decimal(str(v or 0)) for k, v in raw.items()}


def _budget_total(form: dict[str, Any]) -> Decimal:
    return Decimal(str(form.get("budget_total", 0)))


def _duration(form: dict[str, Any]) -> int:
    return int(form.get("duration_months", 0))


def _overhead_pct(budget: dict[str, Decimal], total: Decimal) -> Decimal:
    if total <= 0:
        return Decimal(0)
    return (budget.get("overheads", Decimal(0)) / total * 100).quantize(Decimal("0.1"))


def _budget_sum_check(budget: dict[str, Decimal], total: Decimal) -> CheckResult:
    computed = sum(budget.values())
    diff = abs(computed - total)
    if diff > 500:
        return CheckResult(
            "budget_sum", False,
            f"Line items sum to INR {computed:,.0f} but declared total is INR {total:,.0f} (diff {diff:,.0f} > 500)",
        )
    return CheckResult("budget_sum", True, f"Budget arithmetic OK (diff {diff:,.0f})")


def _overhead_check(budget: dict[str, Decimal], total: Decimal, max_pct: int = 15) -> CheckResult:
    pct = _overhead_pct(budget, total)
    if pct > max_pct:
        return CheckResult(
            "overhead_limit", False,
            f"Overhead is {pct}% of total — exceeds {max_pct}% cap",
        )
    return CheckResult("overhead_limit", True, f"Overhead at {pct}% — within {max_pct}% cap")


# ── CDG (Community Development Grants) ──────────────────────────────────────


def _cdg_checks(app: Application, prog: GrantProgramme, org: Organisation | None) -> list[CheckResult]:
    results: list[CheckResult] = []
    form = _get_form(app)
    budget = _get_budget(form)
    total = _budget_total(form)
    dur = _duration(form)

    # E1: org_type must be ngo, trust, or society
    allowed = {"ngo", "trust", "society"}
    org_type = org.org_type.value if org else "unknown"
    results.append(CheckResult(
        "E1_org_type",
        org_type in allowed,
        f"Organisation type '{org_type}' — {'allowed' if org_type in allowed else 'must be NGO, Trust, or Society'}",
    ))

    # E2: min age 2 years
    if org and org.year_established:
        age = datetime.now(timezone.utc).year - org.year_established
        results.append(CheckResult(
            "E2_min_age", age >= 2,
            f"Organisation age: {age} year(s) — {'meets' if age >= 2 else 'below'} 2-year minimum",
        ))
    else:
        results.append(CheckResult("E2_min_age", False, "Year established not provided"))

    # E3: rural district (from form_data or org state)
    district = str(form.get("target_district", org.state if org else "")).lower().strip()
    is_rural = district in RURAL_DISTRICTS
    results.append(CheckResult(
        "E3_rural_district", is_rural,
        f"District '{district}' — {'recognised rural district' if is_rural else 'not in rural district list'}",
    ))

    # E4: funding range
    results.append(CheckResult(
        "E4_funding_range",
        prog.funding_min_inr <= total <= prog.funding_max_inr,
        f"Budget INR {total:,.0f} — range [{prog.funding_min_inr:,.0f}, {prog.funding_max_inr:,.0f}]",
    ))

    # E5: duration 6-18 months
    results.append(CheckResult(
        "E5_duration", 6 <= dur <= 18,
        f"Duration {dur} months — {'within' if 6 <= dur <= 18 else 'outside'} 6-18 month range",
    ))

    # E6: overhead <= 15%
    results.append(_overhead_check(budget, total, 15))

    # E7: budget sum
    results.append(_budget_sum_check(budget, total))

    return results


# ── EIG (Education Innovation Grants) ───────────────────────────────────────


def _eig_checks(app: Application, prog: GrantProgramme, org: Organisation | None) -> list[CheckResult]:
    results: list[CheckResult] = []
    form = _get_form(app)
    budget = _get_budget(form)
    total = _budget_total(form)
    dur = _duration(form)

    # E1: org_type
    allowed = {"ngo", "trust", "society", "company"}
    org_type = org.org_type.value if org else "unknown"
    results.append(CheckResult(
        "E1_org_type",
        org_type in allowed,
        f"Organisation type '{org_type}' — {'allowed' if org_type in allowed else 'restricted'}",
    ))

    # E2: min age 1 year
    if org and org.year_established:
        age = datetime.now(timezone.utc).year - org.year_established
        results.append(CheckResult(
            "E2_min_age", age >= 1,
            f"Organisation age: {age} year(s) — {'meets' if age >= 1 else 'below'} 1-year minimum",
        ))
    else:
        results.append(CheckResult("E2_min_age", False, "Year established not provided"))

    # E3: funding range
    results.append(CheckResult(
        "E3_funding_range",
        prog.funding_min_inr <= total <= prog.funding_max_inr,
        f"Budget INR {total:,.0f} — range [{prog.funding_min_inr:,.0f}, {prog.funding_max_inr:,.0f}]",
    ))

    # E4: duration 12-24 months
    results.append(CheckResult(
        "E4_duration", 12 <= dur <= 24,
        f"Duration {dur} months — {'within' if 12 <= dur <= 24 else 'outside'} 12-24 month range",
    ))

    # E5: schools >= 5
    schools = int(form.get("number_of_schools", form.get("schools_count", 0)))
    results.append(CheckResult(
        "E5_schools_count", schools >= 5,
        f"{schools} school(s) targeted — {'meets' if schools >= 5 else 'below'} minimum of 5",
    ))

    # E6: grade level specified
    grade = form.get("grade_level", "")
    results.append(CheckResult(
        "E6_grade_level", bool(grade),
        f"Grade level: '{grade}'" if grade else "Grade level not specified",
    ))

    # E7: overhead <= 15%
    results.append(_overhead_check(budget, total, 15))

    # E8: budget sum
    results.append(_budget_sum_check(budget, total))

    return results


# ── ECAG (Environment & Climate Action Grants) ──────────────────────────────


def _ecag_checks(app: Application, prog: GrantProgramme, org: Organisation | None) -> list[CheckResult]:
    results: list[CheckResult] = []
    form = _get_form(app)
    budget = _get_budget(form)
    total = _budget_total(form)
    dur = _duration(form)

    # E1: org_type — any registered entity
    allowed = {"ngo", "trust", "society", "company", "government"}
    org_type = org.org_type.value if org else "unknown"
    results.append(CheckResult(
        "E1_org_type",
        org_type in allowed,
        f"Organisation type '{org_type}' — {'allowed' if org_type in allowed else 'not allowed'}",
    ))

    # E2: funding range
    results.append(CheckResult(
        "E2_funding_range",
        prog.funding_min_inr <= total <= prog.funding_max_inr,
        f"Budget INR {total:,.0f} — range [{prog.funding_min_inr:,.0f}, {prog.funding_max_inr:,.0f}]",
    ))

    # E3: duration 6-24 months
    results.append(CheckResult(
        "E3_duration", 6 <= dur <= 24,
        f"Duration {dur} months — {'within' if 6 <= dur <= 24 else 'outside'} 6-24 month range",
    ))

    # E4: overhead <= 15%
    results.append(_overhead_check(budget, total, 15))

    # E5: budget sum
    results.append(_budget_sum_check(budget, total))

    return results


# ── Programme → check dispatcher ────────────────────────────────────────────

_PROGRAMME_CHECKS: dict[str, Any] = {
    "CDG": _cdg_checks,
    "EIG": _eig_checks,
    "ECAG": _ecag_checks,
}


def run_hard_checks(
    application: Application,
    programme: GrantProgramme,
    organisation: Organisation | None = None,
) -> list[CheckResult]:
    """Evaluate all hard eligibility rules for the programme."""
    checker = _PROGRAMME_CHECKS.get(programme.code)
    if checker is None:
        # Fallback: generic checks for unknown programmes
        form = _get_form(application)
        budget = _get_budget(form)
        total = _budget_total(form)
        return [
            CheckResult(
                "funding_range",
                programme.funding_min_inr <= total <= programme.funding_max_inr,
                f"Budget INR {total:,.0f} in [{programme.funding_min_inr:,.0f}, {programme.funding_max_inr:,.0f}]",
            ),
            _overhead_check(budget, total),
            _budget_sum_check(budget, total),
        ]
    return checker(application, programme, organisation)


# ── Soft checks (AI-powered) ────────────────────────────────────────────────


async def run_soft_checks(
    application: Application,
    programme: GrantProgramme,
) -> dict[str, Any]:
    """Call OpenAI to analyse narrative quality, thematic alignment, etc."""
    form = _get_form(application)

    # Build application text for AI analysis
    application_text = "\n\n".join(
        f"**{k.replace('_', ' ').title()}**: {v}"
        for k, v in form.items()
        if isinstance(v, str) and v.strip()
    )

    grant_theme = programme.purpose or programme.name
    meta = programme.metadata_json or {}
    threshold = meta.get("screening_threshold", 60)

    try:
        from app.ai.openai_client import render_and_call

        result = await render_and_call(
            "screening_soft_check.j2",
            {
                "application_text": application_text,
                "grant_theme": grant_theme,
                "threshold": threshold,
            },
            max_tokens=1500,
            temperature=0.15,
        )
    except Exception as exc:
        logger.error("AI soft-check failed for app %s: %s", application.id, exc)
        result = {
            "thematic_score": 50,
            "thematic_reasoning": f"AI analysis failed: {exc} — manual review required",
            "narrative_coherence": 50,
            "narrative_reasoning": "AI analysis failed — manual review required",
            "beneficiary_specificity": "vague",
            "measurable_outcome": False,
            "soft_flags": [{"flag": f"AI Error: {exc}", "severity": "medium"}],
        }

    return result


# ── Main screening orchestrator ──────────────────────────────────────────────


async def run_screening(
    application_id: uuid.UUID,
    db: AsyncSession,
) -> ScreeningReport:
    """Run full screening (hard + soft checks) and persist the report."""
    logger.info("SCREENING START: %s", application_id)

    # Load application with documents
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
    )
    application = result.scalar_one()

    # Update status to screening
    application.status = ApplicationStatus.screening

    # Load programme
    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    # Load organisation for the applicant
    org_result = await db.execute(
        select(Organisation).where(Organisation.user_id == application.applicant_id)
    )
    organisation = org_result.scalar_one_or_none()

    # ── Hard checks ──────────────────────────────────────────────────────
    hard_results = run_hard_checks(application, programme, organisation)
    hard_checks_json = [r.to_dict() for r in hard_results]
    all_hard_passed = all(r.passed for r in hard_results)

    # ── ECAG geographic priority check ──────────────────────────────────
    ecag_geo_flags: list[dict] = []
    if programme.code == "ECAG":
        form_data = _get_form(application)
        project_district = form_data.get("district", form_data.get("target_district", ""))
        climate_districts = (programme.metadata_json or {}).get("climate_vulnerable_districts", [])
        if project_district:
            is_priority = project_district.lower() in [d.lower() for d in climate_districts]
            if not is_priority:
                ecag_geo_flags.append({
                    "flag": "non_priority_district",
                    "severity": "low",
                    "detail": (
                        f"{project_district} is not in climate-vulnerable priority list "
                        "— not rejected but noted"
                    ),
                })

    # ── Soft checks (AI) ─────────────────────────────────────────────────
    soft_result = await run_soft_checks(application, programme)

    thematic_score = Decimal(str(soft_result.get("thematic_score", 0)))
    narrative_score = Decimal(str(soft_result.get("narrative_coherence", 0)))
    soft_flags = soft_result.get("soft_flags", [])

    # Add ECAG geographic flags
    soft_flags.extend(ecag_geo_flags)

    # Add extra soft flags from AI analysis
    if soft_result.get("beneficiary_specificity") == "missing":
        soft_flags.append({"flag": "No beneficiary information provided", "severity": "high"})
    elif soft_result.get("beneficiary_specificity") == "vague":
        soft_flags.append({"flag": "Beneficiary description is vague", "severity": "medium"})

    if not soft_result.get("measurable_outcome"):
        soft_flags.append({"flag": "Outcomes not clearly measurable", "severity": "medium"})

    # ── Determine overall result ─────────────────────────────────────────
    meta = programme.metadata_json or {}
    threshold = meta.get("screening_threshold", 60)

    if not all_hard_passed:
        overall = ScreeningOutcome.ineligible
    elif thematic_score < threshold or narrative_score < threshold:
        overall = ScreeningOutcome.needs_review
    else:
        overall = ScreeningOutcome.eligible

    # ── Persist report ───────────────────────────────────────────────────
    report = ScreeningReport(
        application_id=application_id,
        hard_checks=hard_checks_json,
        soft_flags=soft_flags,
        overall_result=overall,
        ai_thematic_score=thematic_score,
        ai_narrative_score=narrative_score,
    )
    db.add(report)

    # Auto-advance status for clear results
    if overall == ScreeningOutcome.eligible:
        application.status = ApplicationStatus.eligible
    elif overall == ScreeningOutcome.ineligible:
        application.status = ApplicationStatus.ineligible
    # needs_review stays in "screening" — officer decides

    await db.flush()

    # Audit log
    await write_audit_log(
        db,
        actor_id=None,
        action="screening_completed",
        object_type="application",
        object_id=str(application_id),
        metadata={
            "screening_report_id": str(report.id),
            "overall_result": overall.value,
            "thematic_score": float(thematic_score),
            "narrative_score": float(narrative_score),
            "hard_checks_passed": all_hard_passed,
        },
    )

    # Notify programme officers
    _notify_screening_complete(application, report)

    logger.info(
        "SCREENING COMPLETE: %s -> %s (thematic=%s, narrative=%s)",
        application_id,
        overall.value,
        thematic_score,
        narrative_score,
    )
    return report


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
