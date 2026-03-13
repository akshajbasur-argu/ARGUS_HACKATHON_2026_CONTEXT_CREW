"""Deterministic hard-check rules engine for application screening.

Hard checks are binary pass/fail eligibility gates that do NOT require AI.
They verify structural and programmatic requirements before any AI evaluation.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)


def run_hard_checks(
    form_data: dict[str, Any],
    programme_meta: dict[str, Any],
    *,
    funding_min: Decimal,
    funding_max: Decimal,
    duration_min: int,
    duration_max: int,
    has_registration_number: bool,
    document_count: int,
) -> dict[str, bool]:
    """Run all deterministic hard checks.

    Returns a dict of {check_name: passed} where False = ineligible.
    """
    results: dict[str, bool] = {}

    # 1. Organisation must have a registration number
    results["organisation_registered"] = has_registration_number

    # 2. Requested amount within programme funding range
    requested = form_data.get("requested_amount")
    if requested is not None:
        try:
            amount = Decimal(str(requested))
            results["budget_within_range"] = funding_min <= amount <= funding_max
        except Exception:
            results["budget_within_range"] = False
    else:
        # No amount specified — flag but don't auto-fail
        results["budget_within_range"] = True

    # 3. Project duration within programme limits
    duration = form_data.get("project_duration_months")
    if duration is not None:
        try:
            months = int(duration)
            results["duration_within_range"] = duration_min <= months <= duration_max
        except Exception:
            results["duration_within_range"] = False
    else:
        results["duration_within_range"] = True

    # 4. Required documents present (at least 1 document uploaded)
    results["required_documents_present"] = document_count >= 1

    # 5. Core form fields are non-empty
    required_fields = ["project_title", "problem_statement", "proposed_solution"]
    all_present = all(
        bool(form_data.get(field, "").strip()) if isinstance(form_data.get(field), str)
        else form_data.get(field) is not None
        for field in required_fields
    )
    results["required_fields_complete"] = all_present

    # 6. Eligibility rules from programme metadata (if any)
    eligibility_rules = programme_meta.get("eligibility_rules", {})
    if eligibility_rules.get("min_org_age_years"):
        org_age = form_data.get("organisation_age_years")
        if org_age is not None:
            try:
                results["minimum_org_age"] = int(org_age) >= eligibility_rules["min_org_age_years"]
            except Exception:
                results["minimum_org_age"] = False

    logger.info(
        "Hard checks complete: %d passed, %d failed",
        sum(1 for v in results.values() if v),
        sum(1 for v in results.values() if not v),
    )
    return results


def all_hard_checks_passed(checks: dict[str, bool]) -> bool:
    """Return True only if every hard check passed."""
    return all(checks.values())
