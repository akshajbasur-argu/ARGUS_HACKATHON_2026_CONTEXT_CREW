"""Finance API endpoints — disbursements, expenditure, and dashboard."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_applicant, require_finance_officer
from app.features.auth.models import User
from app.features.auth.service import write_audit_log
from app.features.finance.schemas import (
    DashboardResponse,
    DisbursementRead,
    ExpenditureCreateRequest,
    ExpenditureRead,
    ExpenditureVerifyRequest,
    ReleaseTrancheRequest,
)
from app.features.finance.service import (
    create_expenditure,
    get_dashboard_data,
    list_all_disbursements,
    list_expenditures,
    release_tranche,
    verify_expenditure,
)

router = APIRouter()


# ── GET /disbursements ───────────────────────────────────────────────────────


@router.get("/disbursements", response_model=list[DisbursementRead])
async def list_disbursements(
    officer: Annotated[User, Depends(require_finance_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all disbursement tranches across all applications."""
    return await list_all_disbursements(db)


# ── POST /disbursements/{id}/release ─────────────────────────────────────────


@router.post("/disbursements/{disbursement_id}/release", response_model=DisbursementRead)
async def release_tranche_endpoint(
    disbursement_id: uuid.UUID,
    body: ReleaseTrancheRequest,
    officer: Annotated[User, Depends(require_finance_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Release a disbursement tranche — record bank details and mark as disbursed."""
    try:
        disbursement = await release_tranche(
            db,
            disbursement_id=disbursement_id,
            bank_account=body.bank_account,
            ifsc=body.ifsc,
            beneficiary_name=body.beneficiary_name,
            payment_reference=body.payment_reference,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action="tranche_released",
        object_type="disbursement",
        object_id=str(disbursement_id),
        metadata={
            "amount": str(disbursement.amount_inr),
            "payment_reference": body.payment_reference,
        },
    )
    await db.commit()

    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            str(disbursement.application_id),
            "tranche_released",
            {
                "tranche": disbursement.tranche_label,
                "amount": str(disbursement.amount_inr),
            },
        )
    except Exception:
        pass

    return disbursement


# ── POST /grantee/expenditure — submit expenditure record ────────────────────


@router.post(
    "/grantee/expenditure",
    response_model=ExpenditureRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_expenditure(
    body: ExpenditureCreateRequest,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit an expenditure record for an application."""
    # For now the app_id comes from query param; in production, derive from user's active grant
    from fastapi import Query

    # We'll accept app_id as a query parameter
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Use the /grantee/expenditure/{app_id} endpoint with the application ID",
    )


@router.post(
    "/grantee/expenditure/{app_id}",
    response_model=ExpenditureRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_expenditure_for_app(
    app_id: uuid.UUID,
    body: ExpenditureCreateRequest,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Submit an expenditure record for a specific application."""
    try:
        expenditure = await create_expenditure(
            db,
            app_id=app_id,
            user_id=applicant.id,
            date=body.date,
            payee=body.payee,
            amount_inr=body.amount_inr,
            budget_category=body.budget_category,
            description=body.description,
            receipt_file=body.receipt_file,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=applicant.id,
        action="expenditure_submitted",
        object_type="expenditure",
        object_id=str(expenditure.id),
    )
    await db.commit()
    return expenditure


# ── GET /expenditure/{app_id} — list expenditure records ─────────────────────


@router.get("/expenditure/{app_id}", response_model=list[ExpenditureRead])
async def list_app_expenditures(
    app_id: uuid.UUID,
    officer: Annotated[User, Depends(require_finance_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List expenditure records for an application."""
    return await list_expenditures(db, app_id)


# ── POST /expenditure/{id}/verify — verify expenditure ──────────────────────


@router.post("/expenditure/{expenditure_id}/verify", response_model=ExpenditureRead)
async def verify_expenditure_endpoint(
    expenditure_id: uuid.UUID,
    body: ExpenditureVerifyRequest,
    officer: Annotated[User, Depends(require_finance_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Verify or query an expenditure record."""
    try:
        expenditure = await verify_expenditure(
            db,
            expenditure_id=expenditure_id,
            status_val=body.status,
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action=f"expenditure_{body.status.value}",
        object_type="expenditure",
        object_id=str(expenditure_id),
    )
    await db.commit()
    return expenditure


# ── GET /dashboard — programme-level aggregates ──────────────────────────────


@router.get("/dashboard", response_model=DashboardResponse)
async def finance_dashboard(
    officer: Annotated[User, Depends(require_finance_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Programme-level finance aggregates for the dashboard."""
    return await get_dashboard_data(db)
