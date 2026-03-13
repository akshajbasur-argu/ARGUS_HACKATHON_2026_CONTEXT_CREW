"""Screening API endpoints — staff queue, report detail, officer decisions."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.features.auth.dependencies import require_role
from app.features.auth.models import User
from app.features.screening.schemas import (
    ScreeningDecision,
    ScreeningQueueItem,
    ScreeningReportRead,
)
from app.features.screening.service import (
    get_screening_report,
    list_screening_queue,
    record_decision,
)

router = APIRouter()


# ── GET / — list screening queue ──────────────────────────────────────────────


@router.get("/", response_model=list[ScreeningQueueItem])
async def list_screening(
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
    pending_only: Annotated[bool, Query(description="Only pending decisions")] = False,
) -> list[ScreeningQueueItem]:
    """List all applications in the screening pipeline."""
    return await list_screening_queue(db, pending_only=pending_only)


# ── GET /{application_id} — get screening report ─────────────────────────────


@router.get("/{application_id}", response_model=ScreeningReportRead)
async def get_screening(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScreeningReportRead:
    """Get the full screening report for an application."""
    report = await get_screening_report(db, application_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Screening report not found for this application",
        )
    return report


# ── POST /{application_id}/decide — record officer decision ──────────────────


@router.post("/{application_id}/decide", response_model=ScreeningReportRead)
async def decide_screening(
    application_id: uuid.UUID,
    body: ScreeningDecision,
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScreeningReportRead:
    """Record the programme officer's screening decision."""
    # Validate decision-specific fields
    if body.decision == "ineligible" and not body.reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reason is required when marking as ineligible",
        )
    if body.decision == "clarification" and not body.clarification_question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clarification question is required",
        )

    result = await record_decision(db, application_id, body)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Screening report not found for this application",
        )

    await db.commit()
    return result
