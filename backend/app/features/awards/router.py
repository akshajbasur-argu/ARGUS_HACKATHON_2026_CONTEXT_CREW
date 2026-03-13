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

    # Notify applicant of decision (persisted to DB)
    from app.features.messaging.service import send_notification
    from sqlalchemy import select
    from app.features.applications.models import Application

    app_result = await db.execute(select(Application).where(Application.id == app_id))
    application = app_result.scalar_one_or_none()

    if application:
        decision_val = body.decision.value
        event_map = {
            "approved": "award_approved",
            "rejected": "application_rejected",
            "waitlisted": "application_waitlisted",
        }
        event_type = event_map.get(decision_val, f"application_{decision_val}")
        message_map = {
            "approved": f"Congratulations! Your application {application.reference_number} has been approved for funding.",
            "rejected": f"Your application {application.reference_number} was not selected. Reason: {body.reason}",
            "waitlisted": f"Your application {application.reference_number} has been waitlisted. You will be notified if a spot opens.",
        }
        await send_notification(
            db,
            user_id=application.applicant_id,
            event_type=event_type,
            body=message_map.get(decision_val, f"Decision on application {application.reference_number}: {decision_val}"),
            payload={"application_id": str(app_id), "reference_number": application.reference_number, "decision": decision_val},
        )

    await db.commit()

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

    # Notify applicant that their letter has been sent
    from app.features.messaging.service import send_notification as _send_notif
    from sqlalchemy import select as _select
    from app.features.applications.models import Application as _App

    _app_result = await db.execute(_select(_App).where(_App.id == app_id))
    _application = _app_result.scalar_one_or_none()
    if _application:
        await _send_notif(
            db,
            user_id=_application.applicant_id,
            event_type="letter_sent",
            body=f"A {letter.letter_type} letter has been sent for your application {_application.reference_number}.",
            payload={"application_id": str(app_id), "letter_type": letter.letter_type},
        )

    await db.commit()

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

    # Notify applicant that agreement has been sent
    from app.features.messaging.service import send_notification as _send_notif2
    from sqlalchemy import select as _sel2
    from app.features.applications.models import Application as _App2

    _app_r2 = await db.execute(_sel2(_App2).where(_App2.id == app_id))
    _app2 = _app_r2.scalar_one_or_none()
    if _app2:
        await _send_notif2(
            db,
            user_id=_app2.applicant_id,
            event_type="agreement_sent",
            body=f"A Grant Agreement has been sent for your application {_app2.reference_number}. Please review and acknowledge.",
            payload={"application_id": str(app_id), "agreement_id": str(agreement.id)},
        )

    await db.commit()

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

    # Notify finance officers about tranche readiness
    from app.features.messaging.service import send_notification as _send_ack
    from sqlalchemy import select as _sel_ack
    from app.features.auth.models import User as _UserAck
    from app.core.enums import UserRole as _UR

    fo_result = await db.execute(
        _sel_ack(_UserAck).where(_UserAck.role == _UR.finance_officer, _UserAck.is_active.is_(True))
    )
    for fo in fo_result.scalars().all():
        await _send_ack(
            db,
            user_id=fo.id,
            event_type="tranche_ready",
            body=f"Agreement acknowledged for application {app_id}. Inception tranche is ready for release.",
            payload={"application_id": str(app_id), "agreement_id": str(agreement.id)},
        )

    await db.commit()

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

    # Notify finance officers about tranche readiness
    from app.features.messaging.service import send_notification as _send_ack2
    from sqlalchemy import select as _sel_ack2
    from app.features.auth.models import User as _UserAck2
    from app.core.enums import UserRole as _UR2

    fo_result2 = await db.execute(
        _sel_ack2(_UserAck2).where(_UserAck2.role == _UR2.finance_officer, _UserAck2.is_active.is_(True))
    )
    for fo2 in fo_result2.scalars().all():
        await _send_ack2(
            db,
            user_id=fo2.id,
            event_type="tranche_ready",
            body=f"Agreement acknowledged for application {app_id}. Inception tranche is ready for release.",
            payload={"application_id": str(app_id), "agreement_id": str(agreement.id)},
        )

    await db.commit()

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
