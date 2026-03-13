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
    AssignmentQueueItem,
    AssignReviewers,
    PostReviewDecision,
    PostReviewQueueItem,
    ReviewWorkspaceData,
    ScoreDimension,
    SubmitScores,
)
from app.features.review.service import (
    assign_reviewers,
    complete_review,
    get_review_workspace,
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No review assignment found for this application",
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
