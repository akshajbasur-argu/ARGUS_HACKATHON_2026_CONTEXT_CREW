"""Review API endpoints — assignment, scoring, post-review decisions."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.features.auth.dependencies import require_role
from app.features.auth.models import User
from app.features.review.schemas import (
    AnnotationCreate,
    AnnotationRead,
    AssignmentQueueItem,
    AssignReviewers,
    PostReviewDecision,
    PostReviewQueueItem,
    ReviewWorkspaceData,
    ScoreDimension,
    SubmitScores,
)
from app.features.auth.service import write_audit_log
from app.features.review.service import (
    assign_reviewers,
    complete_review,
    create_annotation,
    get_post_review_item,
    get_review_workspace,
    list_annotations,
    list_post_review_queue,
    list_reviewer_queue,
    record_post_review_decision,
    save_scores,
)

router = APIRouter()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Staff (Programme Officer) endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


# ── POST /assign/{application_id} — assign reviewers ──────────────────────────


@router.post(
    "/assign/{application_id}",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
async def assign_reviewers_endpoint(
    application_id: uuid.UUID,
    body: AssignReviewers,
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Assign reviewers to an application and trigger AI review package generation."""
    try:
        assignments = await assign_reviewers(db, application_id, body.reviewer_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await write_audit_log(
        db,
        actor_id=user.id,
        action="reviewers_assigned",
        object_type="application",
        object_id=str(application_id),
        metadata={"reviewer_ids": [str(rid) for rid in body.reviewer_ids]},
    )

    # Notify each assigned reviewer
    from app.features.messaging.service import send_notification

    for assignment in assignments:
        await send_notification(
            db,
            user_id=assignment.reviewer_id,
            event_type="review_assigned",
            body=f"You have been assigned to review application {application_id}. Please access your review queue.",
            payload={"application_id": str(application_id), "assignment_id": str(assignment.id)},
        )

    await db.commit()

    # Trigger AI review package generation
    from worker.tasks.ai_tasks import task_generate_review_package
    task_generate_review_package.delay(str(application_id))

    return {
        "assigned": len(assignments),
        "assignment_ids": [str(a.id) for a in assignments],
    }


# ── GET /post-review — reviewed applications queue ───────────────────────────


@router.get("/post-review", response_model=list[PostReviewQueueItem])
async def list_post_review(
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
    decision_filter: Annotated[str | None, Query(description="pending|approved|rejected|waitlisted")] = None,
) -> list[PostReviewQueueItem]:
    """List applications that have completed review, ready for decisions."""
    return await list_post_review_queue(db, decision_filter=decision_filter)


# ── GET /post-review/{application_id} — single app post-review detail ────────


@router.get("/post-review/{application_id}", response_model=PostReviewQueueItem)
async def get_post_review_detail(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PostReviewQueueItem:
    """Get post-review detail for a single application (with per-reviewer scores)."""
    item = await get_post_review_item(db, application_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found or not in post-review status",
        )
    return item


# ── POST /decisions/{application_id} — approve/reject/waitlist ────────────────


@router.post("/decisions/{application_id}", response_model=dict)
async def post_review_decision(
    application_id: uuid.UUID,
    body: PostReviewDecision,
    user: Annotated[User, Depends(require_role(UserRole.program_officer, UserRole.platform_admin))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Record a post-review decision: approve, reject, or waitlist."""
    try:
        application = await record_post_review_decision(
            db, application_id, body.decision, body.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await write_audit_log(
        db,
        actor_id=user.id,
        action=f"post_review_{body.decision}",
        object_type="application",
        object_id=str(application_id),
        metadata={"decision": body.decision, "reason": body.reason},
    )

    await db.commit()
    return {"status": application.status.value, "application_id": str(application_id)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Reviewer endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


# ── GET /queue — reviewer's assigned applications ─────────────────────────────


@router.get("/queue", response_model=list[AssignmentQueueItem])
async def reviewer_queue(
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AssignmentQueueItem]:
    """List all applications assigned to the authenticated reviewer."""
    return await list_reviewer_queue(db, user.id)


# ── GET /review/{application_id} — full workspace data ───────────────────────


@router.get("/review/{application_id}", response_model=ReviewWorkspaceData)
async def get_workspace(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReviewWorkspaceData:
    """Get full application + review package + existing scores for the workspace."""
    data = await get_review_workspace(db, application_id, user.id)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to review this application",
        )
    return data


# ── POST /review/{application_id}/scores — save scores ──────────────────────


@router.post("/review/{application_id}/scores", response_model=list[ScoreDimension])
async def submit_scores(
    application_id: uuid.UUID,
    body: SubmitScores,
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScoreDimension]:
    """Save or update dimension scores (auto-save on each change)."""
    try:
        scores = await save_scores(db, application_id, user.id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    return scores


# ── POST /review/{application_id}/submit — complete review ───────────────────


@router.post("/review/{application_id}/submit", response_model=dict)
async def submit_review(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Mark the review as complete (all dimensions must be scored)."""
    try:
        assignment = await complete_review(db, application_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    return {
        "status": "completed",
        "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None,
    }


# ── POST /review/{application_id}/annotations — create annotation ────────────


@router.post(
    "/review/{application_id}/annotations",
    response_model=AnnotationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation_endpoint(
    application_id: uuid.UUID,
    body: AnnotationCreate,
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnotationRead:
    """Create a text annotation on an application."""
    try:
        annotation = await create_annotation(
            db, application_id, user.id,
            text_selection=body.text_selection,
            section=body.section,
            note=body.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    return annotation


# ── GET /review/{application_id}/annotations — list annotations ──────────────


@router.get(
    "/review/{application_id}/annotations",
    response_model=list[AnnotationRead],
)
async def list_annotations_endpoint(
    application_id: uuid.UUID,
    user: Annotated[User, Depends(require_role(UserRole.reviewer))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AnnotationRead]:
    """List all annotations for an application."""
    return await list_annotations(db, application_id)
