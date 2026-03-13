"""Awards API endpoints — decisions, letters, agreements, tranches."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.dependencies import require_applicant, require_program_officer
from app.features.auth.models import User
from app.features.auth.service import write_audit_log
from app.features.awards.schemas import (
    AgreementRead,
    AwardLetterRead,
    AwardRecordRead,
    DecisionRequest,
    DisbursementRead,
    GenerateAgreementRequest,
    LetterPreviewResponse,
    MessageResponse,
    TranchesRequest,
)
from app.features.awards.service import (
    acknowledge_agreement,
    create_tranches,
    generate_agreement,
    get_letter_preview,
    get_tranches,
    record_decision,
    send_agreement,
    send_letter,
)

router = APIRouter()


# ── POST /staff/{app_id}/decision ────────────────────────────────────────────


@router.post(
    "/staff/{app_id}/decision",
    response_model=AwardRecordRead,
    status_code=status.HTTP_201_CREATED,
)
async def make_decision(
    app_id: uuid.UUID,
    body: DecisionRequest,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Record an award decision (approved/rejected/waitlisted) for an application."""
    try:
        award, letter = await record_decision(
            db,
            app_id=app_id,
            officer_id=officer.id,
            decision=body.decision,
            reason=body.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action=f"award_{body.decision.value}",
        object_type="application",
        object_id=str(app_id),
        metadata={"decision": body.decision.value, "reason": body.reason},
    )
    await db.commit()

    # Fire notification (async task)
    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            str(app_id), f"application_{body.decision.value}", {"reference": str(app_id)}
        )
    except Exception:
        pass  # Non-critical — notification failure shouldn't block decision

    return award


# ── GET /staff/{app_id}/letter ───────────────────────────────────────────────


@router.get("/staff/{app_id}/letter", response_model=LetterPreviewResponse)
async def preview_letter(
    app_id: uuid.UUID,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Preview the generated letter (award or rejection) as HTML."""
    try:
        letter = await get_letter_preview(db, app_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return LetterPreviewResponse(
        html=letter.html_content,
        letter_type=letter.letter_type,
        status=letter.status,
    )


# ── POST /staff/{app_id}/send-letter ────────────────────────────────────────


@router.post("/staff/{app_id}/send-letter", response_model=AwardLetterRead)
async def send_letter_endpoint(
    app_id: uuid.UUID,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Officer confirms sending the letter to the applicant."""
    try:
        letter = await send_letter(db, app_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action="letter_sent",
        object_type="award_letter",
        object_id=str(letter.id),
    )
    await db.commit()

    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            str(app_id), "letter_sent", {"letter_type": letter.letter_type}
        )
    except Exception:
        pass

    return letter


# ── POST /staff/{app_id}/generate-agreement ──────────────────────────────────


@router.post("/staff/{app_id}/generate-agreement", response_model=AgreementRead)
async def generate_agreement_endpoint(
    app_id: uuid.UUID,
    body: GenerateAgreementRequest,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate a Grant Agreement from template with all merge fields."""
    try:
        agreement = await generate_agreement(
            db,
            app_id=app_id,
            special_conditions=body.special_conditions,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await db.commit()
    return agreement


# ── POST /staff/{app_id}/send-agreement ──────────────────────────────────────


@router.post("/staff/{app_id}/send-agreement", response_model=AgreementRead)
async def send_agreement_endpoint(
    app_id: uuid.UUID,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send the agreement to the grantee with acknowledgement link."""
    try:
        agreement = await send_agreement(db, app_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action="agreement_sent",
        object_type="agreement",
        object_id=str(agreement.id),
    )
    await db.commit()

    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            str(app_id), "agreement_sent", {"agreement_id": str(agreement.id)}
        )
    except Exception:
        pass

    return agreement


# ── GET /grantee/{app_id}/agreement — get agreement for applicant ────────────


@router.get("/grantee/{app_id}/agreement", response_model=AgreementRead)
async def get_agreement_for_grantee(
    app_id: uuid.UUID,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the agreement for an application (grantee view)."""
    from app.features.awards.service import get_award_with_agreement
    award = await get_award_with_agreement(db, app_id)
    if award is None or award.agreement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No agreement found")
    return award.agreement


# ── POST /grantee/{app_id}/acknowledge ───────────────────────────────────────


@router.post("/grantee/{app_id}/acknowledge", response_model=AgreementRead)
async def acknowledge_agreement_endpoint(
    app_id: uuid.UUID,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Grantee acknowledges the agreement — triggers inception tranche readiness."""
    try:
        agreement = await acknowledge_agreement(db, app_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=applicant.id,
        action="agreement_acknowledged",
        object_type="agreement",
        object_id=str(agreement.id),
    )
    await db.commit()

    try:
        from worker.tasks.notification_tasks import task_send_notification

        task_send_notification.delay(
            str(app_id), "agreement_acknowledged", {"agreement_id": str(agreement.id)}
        )
        # Also notify about tranche readiness
        task_send_notification.delay(
            str(app_id), "tranche_ready", {"agreement_id": str(agreement.id)}
        )
    except Exception:
        pass

    return agreement


# Alias route for /grantee/agreements/{app_id}/acknowledge
@router.post("/grantee/agreements/{app_id}/acknowledge", response_model=AgreementRead)
async def acknowledge_agreement_alias(
    app_id: uuid.UUID,
    applicant: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Alias: Grantee acknowledges the agreement."""
    try:
        agreement = await acknowledge_agreement(db, app_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=applicant.id,
        action="agreement_acknowledged",
        object_type="agreement",
        object_id=str(agreement.id),
    )
    await db.commit()

    # Notify finance officers about tranche readiness
    try:
        from worker.tasks.notification_tasks import task_send_notification
        task_send_notification.delay(
            str(app_id), "tranche_ready", {"agreement_id": str(agreement.id)}
        )
    except Exception:
        pass

    return agreement


# ── POST /staff/{app_id}/tranches ────────────────────────────────────────────


@router.post(
    "/staff/{app_id}/tranches",
    response_model=list[DisbursementRead],
    status_code=status.HTTP_201_CREATED,
)
async def set_tranches(
    app_id: uuid.UUID,
    body: TranchesRequest,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Set disbursement tranches for an application."""
    tranche_dicts = [
        {
            "label": t.label,
            "amount_inr": t.amount_inr,
            "trigger_type": t.trigger_type,
            "notes": t.notes,
        }
        for t in body.tranches
    ]

    try:
        tranches = await create_tranches(db, app_id=app_id, tranches=tranche_dicts)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await write_audit_log(
        db,
        actor_id=officer.id,
        action="tranches_set",
        object_type="application",
        object_id=str(app_id),
        metadata={"count": len(tranches)},
    )
    await db.commit()
    return tranches


# ── GET /staff/{app_id}/tranches ─────────────────────────────────────────────


@router.get("/staff/{app_id}/tranches", response_model=list[DisbursementRead])
async def list_tranches(
    app_id: uuid.UUID,
    officer: Annotated[User, Depends(require_program_officer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List disbursement tranches for an application."""
    return await get_tranches(db, app_id)
