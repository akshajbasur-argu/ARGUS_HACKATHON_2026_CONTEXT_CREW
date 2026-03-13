"""Finance service — disbursement, expenditure, and dashboard aggregation."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DisbursementStatus, ExpenditureStatus
from app.features.applications.models import Application
from app.features.finance.models import Disbursement, Expenditure
from app.features.programmes.models import GrantProgramme


# ── Disbursement service ─────────────────────────────────────────────────────


async def list_all_disbursements(db: AsyncSession) -> list[Disbursement]:
    """List all disbursement records across all applications."""
    result = await db.execute(
        select(Disbursement).order_by(Disbursement.application_id)
    )
    return list(result.scalars().all())


async def get_disbursement_by_id(db: AsyncSession, disbursement_id: uuid.UUID) -> Disbursement | None:
    result = await db.execute(
        select(Disbursement).where(Disbursement.id == disbursement_id)
    )
    return result.scalar_one_or_none()


async def release_tranche(
    db: AsyncSession,
    *,
    disbursement_id: uuid.UUID,
    bank_account: str,
    ifsc: str,
    beneficiary_name: str,
    payment_reference: str,
) -> Disbursement:
    """Release a tranche — record bank details and mark as disbursed."""
    disbursement = await get_disbursement_by_id(db, disbursement_id)
    if disbursement is None:
        raise ValueError("Disbursement not found")

    if disbursement.status == DisbursementStatus.disbursed:
        raise ValueError("Tranche has already been disbursed")

    disbursement.status = DisbursementStatus.disbursed
    disbursement.released_at = datetime.now(timezone.utc)
    disbursement.bank_details = {
        "bank_account": bank_account,
        "ifsc": ifsc,
        "beneficiary_name": beneficiary_name,
        "payment_reference": payment_reference,
    }

    await db.flush()
    return disbursement


# ── Expenditure service ──────────────────────────────────────────────────────


async def create_expenditure(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    user_id: uuid.UUID,
    date: object,
    payee: str,
    amount_inr: Decimal,
    budget_category: str,
    description: str,
    receipt_file: str | None,
) -> Expenditure:
    """Submit an expenditure record."""
    expenditure = Expenditure(
        application_id=app_id,
        submitted_by=user_id,
        date=date,
        payee=payee,
        amount_inr=amount_inr,
        budget_category=budget_category,
        description=description,
        receipt_path=receipt_file,
    )
    db.add(expenditure)
    await db.flush()
    return expenditure


async def list_expenditures(db: AsyncSession, app_id: uuid.UUID) -> list[Expenditure]:
    """List expenditure records for an application."""
    result = await db.execute(
        select(Expenditure)
        .where(Expenditure.application_id == app_id)
        .order_by(Expenditure.date.desc())
    )
    return list(result.scalars().all())


async def verify_expenditure(
    db: AsyncSession,
    *,
    expenditure_id: uuid.UUID,
    status_val: ExpenditureStatus,
    notes: str | None,
) -> Expenditure:
    """Verify or query an expenditure record."""
    result = await db.execute(
        select(Expenditure).where(Expenditure.id == expenditure_id)
    )
    expenditure = result.scalar_one_or_none()
    if expenditure is None:
        raise ValueError("Expenditure not found")

    expenditure.status = status_val
    expenditure.reviewer_notes = notes
    if status_val == ExpenditureStatus.verified:
        expenditure.verified_at = datetime.now(timezone.utc)

    await db.flush()
    return expenditure


# ── Dashboard aggregation ────────────────────────────────────────────────────


async def get_dashboard_data(db: AsyncSession) -> dict:
    """Aggregate programme-level finance data for the dashboard."""
    # Get all applications with their programmes
    apps_result = await db.execute(
        select(Application, GrantProgramme)
        .join(GrantProgramme, Application.programme_id == GrantProgramme.id)
    )
    app_rows = apps_result.all()

    # Get all disbursements grouped by application
    disb_result = await db.execute(
        select(
            Disbursement.application_id,
            sa_func.sum(Disbursement.amount_inr).label("total_committed"),
            sa_func.sum(
                sa_func.coalesce(
                    # Only count disbursed amounts
                    Disbursement.amount_inr.op("*")(
                        sa_func.cast(
                            Disbursement.status == DisbursementStatus.disbursed,
                            Disbursement.amount_inr.type,
                        )
                    ),
                    0,
                )
            ).label("total_disbursed"),
        )
        .group_by(Disbursement.application_id)
    )
    # Simpler approach: query raw
    all_disb_result = await db.execute(select(Disbursement))
    all_disb = all_disb_result.scalars().all()

    disb_by_app: dict[uuid.UUID, dict] = defaultdict(lambda: {"committed": Decimal("0"), "disbursed": Decimal("0")})
    for d in all_disb:
        disb_by_app[d.application_id]["committed"] += d.amount_inr
        if d.status == DisbursementStatus.disbursed:
            disb_by_app[d.application_id]["disbursed"] += d.amount_inr

    # Get all expenditures grouped by application
    all_exp_result = await db.execute(select(Expenditure))
    all_exp = all_exp_result.scalars().all()

    exp_by_app: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    for e in all_exp:
        exp_by_app[e.application_id] += e.amount_inr

    # Build grant summaries
    total_committed = Decimal("0")
    total_disbursed = Decimal("0")
    total_spent = Decimal("0")
    grants_by_status: dict[str, int] = defaultdict(int)
    grants = []

    for app, programme in app_rows:
        app_disb = disb_by_app.get(app.id, {"committed": Decimal("0"), "disbursed": Decimal("0")})
        committed = app_disb["committed"]
        disbursed = app_disb["disbursed"]
        spent = exp_by_app.get(app.id, Decimal("0"))

        total_committed += committed
        total_disbursed += disbursed
        total_spent += spent
        grants_by_status[app.status.value] += 1

        budget = committed if committed > 0 else Decimal("0")
        pct = float(spent / budget * 100) if budget > 0 else 0.0

        grants.append({
            "application_id": str(app.id),
            "reference_number": app.reference_number,
            "programme_name": programme.name,
            "status": app.status.value,
            "budget": budget,
            "disbursed": disbursed,
            "spent": spent,
            "pct_spent": round(pct, 1),
        })

    return {
        "total_committed": total_committed,
        "total_disbursed": total_disbursed,
        "total_reported_expenditure": total_spent,
        "grant_count": len(app_rows),
        "grants_by_status": dict(grants_by_status),
        "grants": grants,
    }


async def get_programme_dashboard_data(db: AsyncSession) -> dict:
    """Aggregate finance data grouped by programme for the programme overview tab."""
    # Get all applications joined with programmes
    apps_result = await db.execute(
        select(Application, GrantProgramme)
        .join(GrantProgramme, Application.programme_id == GrantProgramme.id)
    )
    app_rows = apps_result.all()

    # Get all disbursements
    all_disb_result = await db.execute(select(Disbursement))
    all_disb = all_disb_result.scalars().all()

    disb_by_app: dict[uuid.UUID, dict] = defaultdict(lambda: {"committed": Decimal("0"), "disbursed": Decimal("0")})
    for d in all_disb:
        disb_by_app[d.application_id]["committed"] += d.amount_inr
        if d.status == DisbursementStatus.disbursed:
            disb_by_app[d.application_id]["disbursed"] += d.amount_inr

    # Get all expenditures
    all_exp_result = await db.execute(select(Expenditure))
    all_exp = all_exp_result.scalars().all()

    exp_by_app: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    for e in all_exp:
        exp_by_app[e.application_id] += e.amount_inr

    # Aggregate per-programme
    prog_agg: dict[str, dict] = {}
    total_committed = Decimal("0")
    total_disbursed = Decimal("0")
    total_spent = Decimal("0")
    grants_by_status: dict[str, int] = defaultdict(int)

    for app, programme in app_rows:
        code = programme.code
        if code not in prog_agg:
            prog_agg[code] = {
                "programme_code": code,
                "programme_name": programme.name,
                "committed": Decimal("0"),
                "disbursed": Decimal("0"),
                "spent": Decimal("0"),
                "grant_count": 0,
            }

        app_disb = disb_by_app.get(app.id, {"committed": Decimal("0"), "disbursed": Decimal("0")})
        committed = app_disb["committed"]
        disbursed = app_disb["disbursed"]
        spent = exp_by_app.get(app.id, Decimal("0"))

        prog_agg[code]["committed"] += committed
        prog_agg[code]["disbursed"] += disbursed
        prog_agg[code]["spent"] += spent
        prog_agg[code]["grant_count"] += 1

        total_committed += committed
        total_disbursed += disbursed
        total_spent += spent
        grants_by_status[app.status.value] += 1

    # Compute utilisation percentages
    per_programme = []
    for entry in sorted(prog_agg.values(), key=lambda x: x["programme_code"]):
        pct = float(entry["spent"] / entry["committed"] * 100) if entry["committed"] > 0 else 0.0
        per_programme.append({
            **entry,
            "utilisation_pct": round(pct, 1),
        })

    return {
        "total_committed_inr": total_committed,
        "total_disbursed_inr": total_disbursed,
        "total_reported_expenditure_inr": total_spent,
        "grants_by_status": dict(grants_by_status),
        "per_programme": per_programme,
    }
