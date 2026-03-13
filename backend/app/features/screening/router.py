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
from app.features.auth.service import write_audit_log
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

    # Audit log for screening decision
    await write_audit_log(
        db,
        actor_id=user.id,
        action=f"screening_{body.decision}",
        object_type="application",
        object_id=str(application_id),
        metadata={
            "decision": body.decision,
            "reason": body.reason,
            "clarification_question": body.clarification_question,
        },
    )

    # Notify applicant of screening outcome
    from app.features.messaging.service import send_notification
    from sqlalchemy import select
    from app.features.applications.models import Application

    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one_or_none()

    if application:
        if body.decision == "eligible":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="screening_complete_eligible",
                body=f"Your application {application.reference_number} has passed screening and is eligible for review.",
                payload={"application_id": str(application_id), "reference_number": application.reference_number},
            )
        elif body.decision == "ineligible":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="screening_complete_ineligible",
                body=f"Your application {application.reference_number} did not meet eligibility criteria. Reason: {body.reason}",
                payload={
                    "application_id": str(application_id),
                    "reference_number": application.reference_number,
                    "reason": body.reason,
                },
            )
        elif body.decision == "clarification":
            await send_notification(
                db,
                user_id=application.applicant_id,
                event_type="clarification_requested",
                body=f"Clarification needed for your application {application.reference_number}: {body.clarification_question}",
                payload={
                    "application_id": str(application_id),
                    "reference_number": application.reference_number,
                    "question": body.clarification_question,
                },
            )

    await db.commit()
    return result
