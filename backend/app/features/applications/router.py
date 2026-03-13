"""Applications API — CRUD, submit, documents, timeline, chatbot intake."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import ApplicationStatus, UserRole
from app.features.applications.chatbot_service import handle_chat_intake
from app.features.applications.schemas import (
    ApplicationCreate,
    ApplicationListItem,
    ApplicationRead,
    ApplicationTimeline,
    ApplicationUpdate,
    ChatIntakeRequest,
    ChatIntakeResponse,
    DocumentAttach,
)
from app.features.applications.service import (
    attach_document_to_app,
    create_application,
    get_application,
    get_application_timeline,
    list_applications,
    submit_application,
    update_application,
)
from app.features.auth.dependencies import require_auth, require_role
from app.features.auth.models import User
from app.features.auth.service import write_audit_log

router = APIRouter()


# ── POST /chat — AI-guided conversational intake ────────────────────────────


@router.post("/chat", response_model=ChatIntakeResponse)
async def chatbot_intake(
    body: ChatIntakeRequest,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatIntakeResponse:
    """AI-guided conversational application intake.

    Collects application fields one at a time through natural conversation.
    The applicant sends messages and the assistant guides them through each
    required field for the selected programme.
    """
    return await handle_chat_intake(body, db)


# ── GET / — list my applications ─────────────────────────────────────────────


@router.get("", response_model=list[ApplicationListItem])
async def list_my_applications(
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
    programme_id: uuid.UUID | None = None,
    status_filter: ApplicationStatus | None = None,
) -> list[ApplicationListItem]:
    """List all applications for the authenticated applicant."""
    return await list_applications(
        db, user.id, programme_id=programme_id, status_filter=status_filter
    )


# ── POST / — create new application ─────────────────────────────────────────


@router.post(
    "",
    response_model=ApplicationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_new_application(
    body: ApplicationCreate,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationRead:
    """Create a new draft application."""
    try:
        app = await create_application(db, user.id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await write_audit_log(
        db,
        actor_id=user.id,
        action="application_created",
        object_type="application",
        object_id=str(app.id),
        metadata={"programme_id": str(body.programme_id)},
    )
    await db.commit()

    return await get_application(db, app.id)  # type: ignore[return-value]


# ── GET /{id} — application detail ───────────────────────────────────────────


@router.get("/{application_id}", response_model=ApplicationRead)
async def get_application_detail(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationRead:
    """Get full application detail."""
    owner_id = user.id if user.role == UserRole.applicant else None
    app = await get_application(db, application_id, applicant_id=owner_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


# ── PUT /{id} — save draft (auto-save) ───────────────────────────────────────


@router.put("/{application_id}", response_model=ApplicationRead)
async def save_draft(
    application_id: uuid.UUID,
    body: ApplicationUpdate,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationRead:
    """Save application form data (auto-save / manual save)."""
    try:
        app = await update_application(db, application_id, user.id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")

    await db.commit()
    return await get_application(db, application_id)  # type: ignore[return-value]


# ── POST /{id}/submit — finalize submission ──────────────────────────────────


@router.post("/{application_id}/submit")
async def submit(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Validate and submit the application, triggering AI screening."""
    try:
        app, errors = await submit_application(db, application_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if errors:
        return {
            "submitted": False,
            "errors": [e.model_dump() for e in errors],
        }

    # Trigger async screening
    try:
        from worker.tasks.ai_tasks import task_screen_application

        task_screen_application.delay(str(application_id))
    except Exception as exc:
        logger.error("Failed to dispatch screening task for %s: %s", application_id, exc)
        # Screening will be picked up by periodic check or manual retry

    await write_audit_log(
        db,
        actor_id=user.id,
        action="application_submitted",
        object_type="application",
        object_id=str(application_id),
    )
    await db.commit()

    return {"submitted": True, "reference_number": app.reference_number}


# ── POST /{id}/documents — attach vault document ────────────────────────────


@router.post("/{application_id}/documents", status_code=status.HTTP_201_CREATED)
async def attach_document(
    application_id: uuid.UUID,
    body: DocumentAttach,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Attach a vault document to the application."""
    doc = await attach_document_to_app(
        db, application_id, body.document_id, user.id
    )
    if doc is None:
        raise HTTPException(
            status_code=404,
            detail="Application or document not found",
        )
    await db.commit()
    return {"id": str(doc.id), "doc_type": doc.doc_type, "filename": doc.filename}


# ── GET /{id}/timeline — stage history ───────────────────────────────────────


@router.get("/{application_id}/timeline", response_model=ApplicationTimeline)
async def timeline(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationTimeline:
    """Get the stage timeline for an application."""
    tl = await get_application_timeline(db, application_id)
    if tl is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return tl
