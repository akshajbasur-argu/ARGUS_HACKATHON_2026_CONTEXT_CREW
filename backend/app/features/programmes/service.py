"""Service layer for Grant Programmes."""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.programmes.models import GrantProgramme
from app.features.programmes.schemas import (
    ApplicationWindow,
    DisbursementMilestone,
    EligibilityCriterion,
    FailedRule,
    PrecheckRequest,
    PrecheckResultItem,
    ProgrammeDetail,
    ProgrammeListItem,
    ScoringDimension,
)
from app.features.programmes.seeds import PROGRAMME_SEEDS, RULE_CHECKERS


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_list_item(p: GrantProgramme) -> ProgrammeListItem:
    meta = p.metadata_json or {}
    aw = meta.get("application_window", {})
    dims = [ScoringDimension(**d) for d in meta.get("scoring_rubric", [])]
    return ProgrammeListItem(
        id=p.id,
        code=p.code,
        name=p.name,
        purpose=p.purpose,
        funding_min_inr=p.funding_min_inr,
        funding_max_inr=p.funding_max_inr,
        duration_min_months=p.duration_min_months,
        duration_max_months=p.duration_max_months,
        application_window=ApplicationWindow(
            opens=aw.get("opens"), closes=aw.get("closes")
        ),
        scoring_dimensions=dims,
        is_active=p.is_active,
    )


def _to_detail(p: GrantProgramme) -> ProgrammeDetail:
    meta = p.metadata_json or {}
    aw = meta.get("application_window", {})
    dims = [ScoringDimension(**d) for d in meta.get("scoring_rubric", [])]
    criteria = [EligibilityCriterion(**c) for c in meta.get("eligibility_criteria", [])]
    disbursement = [DisbursementMilestone(**m) for m in meta.get("disbursement_schedule", [])]
    return ProgrammeDetail(
        id=p.id,
        code=p.code,
        name=p.name,
        purpose=p.purpose,
        funding_min_inr=p.funding_min_inr,
        funding_max_inr=p.funding_max_inr,
        duration_min_months=p.duration_min_months,
        duration_max_months=p.duration_max_months,
        application_window=ApplicationWindow(
            opens=aw.get("opens"), closes=aw.get("closes")
        ),
        scoring_dimensions=dims,
        is_active=p.is_active,
        eligibility_criteria=criteria,
        disbursement_schedule=disbursement,
        max_awards_per_cycle=p.max_awards_per_cycle,
        total_budget_inr=p.total_budget_inr,
    )


# ── Seeding ───────────────────────────────────────────────────────────────────

async def ensure_seeded(db: AsyncSession) -> None:
    """Insert the three canonical programmes if the table is empty."""
    result = await db.execute(select(GrantProgramme).limit(1))
    if result.scalars().first() is not None:
        return

    for seed in PROGRAMME_SEEDS:
        programme = GrantProgramme(
            code=seed["code"],
            name=seed["name"],
            purpose=seed.get("purpose"),
            funding_min_inr=seed["funding_min_inr"],
            funding_max_inr=seed["funding_max_inr"],
            duration_min_months=seed["duration_min_months"],
            duration_max_months=seed["duration_max_months"],
            max_awards_per_cycle=seed.get("max_awards_per_cycle"),
            total_budget_inr=seed.get("total_budget_inr"),
            is_active=seed.get("is_active", True),
            metadata_json=seed.get("metadata_json", {}),
        )
        db.add(programme)
    await db.commit()


# ── Public service functions ──────────────────────────────────────────────────

async def list_programmes(db: AsyncSession) -> list[ProgrammeListItem]:
    await ensure_seeded(db)
    result = await db.execute(
        select(GrantProgramme)
        .where(GrantProgramme.is_active.is_(True))
        .order_by(GrantProgramme.code)
    )
    programmes = result.scalars().all()
    return [_to_list_item(p) for p in programmes]


async def get_programme(db: AsyncSession, programme_id: uuid.UUID) -> ProgrammeDetail | None:
    await ensure_seeded(db)
    result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == programme_id)
    )
    programme = result.scalars().first()
    return _to_detail(programme) if programme else None


async def precheck_eligibility(
    db: AsyncSession,
    req: PrecheckRequest,
) -> list[PrecheckResultItem]:
    await ensure_seeded(db)

    # Fetch target programmes
    stmt = select(GrantProgramme).where(GrantProgramme.is_active.is_(True))
    if req.programme_id is not None:
        stmt = stmt.where(GrantProgramme.id == req.programme_id)

    result = await db.execute(stmt)
    programmes = result.scalars().all()

    results: list[PrecheckResultItem] = []
    for prog in programmes:
        checker = RULE_CHECKERS.get(prog.code)
        if checker is None:
            # No rules defined → assume eligible
            failed: list[dict] = []
        else:
            failed = checker(
                req.org_type,
                req.project_district,
                Decimal(str(req.funding_amount_inr)),
            )

        results.append(
            PrecheckResultItem(
                programme_id=prog.id,
                programme_code=prog.code,
                programme_name=prog.name,
                result="likely_eligible" if not failed else "likely_ineligible",
                failed_rules=[FailedRule(**f) for f in failed],
            )
        )

    return results
