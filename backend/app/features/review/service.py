"""Review service — assignment, scoring, post-review decisions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, case, literal, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.review_packager import DEFAULT_RUBRIC, get_rubric
from app.core.enums import ApplicationStatus, UserRole
from app.features.applications.models import Application
from app.features.auth.models import User
from app.features.programmes.models import GrantProgramme
from app.features.review.models import ReviewAssignment, ReviewPackage, ReviewScore
from app.features.review.schemas import (
    AssignmentQueueItem,
    PostReviewQueueItem,
    ReviewerScoreSet,
    ReviewPackageRead,
    ReviewWorkspaceData,
    RiskFlagItem,
    ScoreDimension,
    ScoreItem,
    SubmitScores,
)


# ── Reviewer count requirements per programme code ───────────────────────────

REQUIRED_REVIEWERS: dict[str, int] = {
    "CDG": 1,
    "EIG": 2,
    "ECAG": 1,
}


# ── Assign reviewers ─────────────────────────────────────────────────────────


async def assign_reviewers(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewer_ids: list[uuid.UUID],
) -> list[ReviewAssignment]:
    """Assign reviewers to an application.

    Validates:
    - Correct reviewer count per programme
    - Conflict of interest (email domain check)
    - Application is in eligible status
    """
    # Load application + programme
    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one_or_none()
    if application is None:
        raise ValueError("Application not found")

    if application.status != ApplicationStatus.eligible:
        raise ValueError(f"Application must be in 'eligible' status, currently '{application.status.value}'")

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    # Validate reviewer count
    required = REQUIRED_REVIEWERS.get(programme.code, 1)
    if len(reviewer_ids) != required:
        raise ValueError(f"Programme {programme.code} requires exactly {required} reviewer(s), got {len(reviewer_ids)}")

    # Load applicant for conflict check
    applicant_result = await db.execute(
        select(User).where(User.id == application.applicant_id)
    )
    applicant = applicant_result.scalar_one()
    applicant_domain = applicant.email.split("@")[-1].lower()

    # Validate reviewers and conflict of interest
    assignments: list[ReviewAssignment] = []
    for rid in reviewer_ids:
        reviewer_result = await db.execute(
            select(User).where(User.id == rid, User.role == UserRole.reviewer)
        )
        reviewer = reviewer_result.scalar_one_or_none()
        if reviewer is None:
            raise ValueError(f"Reviewer {rid} not found or not a reviewer")

        reviewer_domain = reviewer.email.split("@")[-1].lower()
        if reviewer_domain == applicant_domain:
            raise ValueError(
                f"Conflict of interest: reviewer {reviewer.full_name} shares email domain "
                f"'{reviewer_domain}' with applicant"
            )

        # Check for existing assignment
        existing = await db.execute(
            select(ReviewAssignment).where(
                ReviewAssignment.application_id == application_id,
                ReviewAssignment.reviewer_id == rid,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Reviewer {reviewer.full_name} is already assigned to this application")

        assignment = ReviewAssignment(
            application_id=application_id,
            reviewer_id=rid,
        )
        db.add(assignment)
        assignments.append(assignment)

    # Update application status
    application.status = ApplicationStatus.under_review

    await db.flush()
    return assignments


# ── Reviewer queue ────────────────────────────────────────────────────────────


async def list_reviewer_queue(
    db: AsyncSession,
    reviewer_id: uuid.UUID,
) -> list[AssignmentQueueItem]:
    """List all applications assigned to a reviewer."""
    q = (
        select(
            ReviewAssignment.id.label("assignment_id"),
            ReviewAssignment.application_id,
            Application.reference_number,
            GrantProgramme.name.label("programme_name"),
            User.full_name.label("applicant_name"),
            ReviewAssignment.assigned_at,
            ReviewAssignment.completed_at,
            case(
                (ReviewPackage.id.isnot(None), literal(True)),
                else_=literal(False),
            ).label("has_package"),
        )
        .join(Application, Application.id == ReviewAssignment.application_id)
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .join(User, User.id == Application.applicant_id)
        .outerjoin(ReviewPackage, ReviewPackage.application_id == Application.id)
        .where(ReviewAssignment.reviewer_id == reviewer_id)
        .order_by(ReviewAssignment.completed_at.asc().nullsfirst(), ReviewAssignment.assigned_at.desc())
    )

    result = await db.execute(q)
    rows = result.all()

    return [
        AssignmentQueueItem(
            assignment_id=row.assignment_id,
            application_id=row.application_id,
            reference_number=row.reference_number,
            programme_name=row.programme_name,
            applicant_name=row.applicant_name,
            assigned_at=row.assigned_at,
            completed_at=row.completed_at,
            has_package=row.has_package,
        )
        for row in rows
    ]


# ── Review workspace data ────────────────────────────────────────────────────


async def get_review_workspace(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewer_id: uuid.UUID,
) -> ReviewWorkspaceData | None:
    """Get full workspace data for a reviewer reviewing an application."""
    # Load assignment
    assign_result = await db.execute(
        select(ReviewAssignment)
        .options(selectinload(ReviewAssignment.scores))
        .where(
            ReviewAssignment.application_id == application_id,
            ReviewAssignment.reviewer_id == reviewer_id,
        )
    )
    assignment = assign_result.scalar_one_or_none()
    if assignment is None:
        return None

    # Load application with documents
    app_result = await db.execute(
        select(Application)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
    )
    application = app_result.scalar_one()

    # Load programme
    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    # Load applicant name
    user_result = await db.execute(
        select(User.full_name).where(User.id == application.applicant_id)
    )
    applicant_name = user_result.scalar_one()

    # Load review package (latest)
    pkg_result = await db.execute(
        select(ReviewPackage)
        .where(ReviewPackage.application_id == application_id)
        .order_by(ReviewPackage.generated_at.desc())
        .limit(1)
    )
    package = pkg_result.scalar_one_or_none()

    rubric = get_rubric(programme)

    # Build existing scores
    existing_scores: list[ScoreDimension] = []
    score_map = {s.dimension: s for s in assignment.scores}
    for r in rubric:
        dim = r["dimension"]
        score = score_map.get(dim)
        ai_score_val = None
        if package and dim in (package.suggested_scores or {}):
            ai_score_val = Decimal(str(package.suggested_scores[dim]))

        existing_scores.append(ScoreDimension(
            dimension=dim,
            label=r.get("label", dim.replace("_", " ").title()),
            weight=r.get("weight", 0),
            ai_score=ai_score_val,
            human_score=score.human_score if score else None,
            human_comment=score.human_comment if score else None,
        ))

    docs = [
        {"id": str(d.id), "doc_type": d.doc_type, "filename": d.filename}
        for d in application.documents
    ]

    pkg_read = None
    if package:
        pkg_read = ReviewPackageRead(
            id=package.id,
            summary_text=package.summary_text or "",
            suggested_scores=package.suggested_scores or {},
            risk_flags=[
                RiskFlagItem(**f) if isinstance(f, dict) else f
                for f in (package.risk_flags or [])
            ],
            generated_at=package.generated_at,
        )

    return ReviewWorkspaceData(
        application_id=application.id,
        reference_number=application.reference_number,
        programme_name=programme.name,
        programme_code=programme.code,
        applicant_name=applicant_name,
        status=application.status,
        form_data=application.form_data or {},
        documents=docs,
        assignment_id=assignment.id,
        assigned_at=assignment.assigned_at,
        completed_at=assignment.completed_at,
        package=pkg_read,
        rubric=rubric,
        existing_scores=existing_scores,
    )


# ── Submit / update scores ───────────────────────────────────────────────────


async def save_scores(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    data: SubmitScores,
) -> list[ScoreDimension]:
    """Save or update reviewer scores for an application."""
    # Load assignment with scores
    assign_result = await db.execute(
        select(ReviewAssignment)
        .options(selectinload(ReviewAssignment.scores))
        .where(
            ReviewAssignment.application_id == application_id,
            ReviewAssignment.reviewer_id == reviewer_id,
        )
    )
    assignment = assign_result.scalar_one_or_none()
    if assignment is None:
        raise ValueError("No assignment found for this reviewer and application")

    if assignment.completed_at is not None:
        raise ValueError("Review already submitted — cannot modify scores")

    # Load package for AI score validation
    pkg_result = await db.execute(
        select(ReviewPackage)
        .where(ReviewPackage.application_id == application_id)
        .order_by(ReviewPackage.generated_at.desc())
        .limit(1)
    )
    package = pkg_result.scalar_one_or_none()
    ai_scores = (package.suggested_scores or {}) if package else {}

    # Validate: if human_score != ai_score, comment required
    for item in data.scores:
        ai_val = ai_scores.get(item.dimension)
        if ai_val is not None:
            ai_int = round(float(ai_val))
            if item.human_score != ai_int and not item.comment:
                raise ValueError(
                    f"Comment required for dimension '{item.dimension}': "
                    f"human score ({item.human_score}) differs from AI score ({ai_int})"
                )

    # Upsert scores
    score_map = {s.dimension: s for s in assignment.scores}
    now = datetime.now(timezone.utc)

    for item in data.scores:
        existing = score_map.get(item.dimension)
        if existing:
            existing.human_score = Decimal(str(item.human_score))
            existing.human_comment = item.comment
            existing.submitted_at = now
        else:
            score = ReviewScore(
                assignment_id=assignment.id,
                dimension=item.dimension,
                ai_score=Decimal(str(ai_scores.get(item.dimension, 0))),
                human_score=Decimal(str(item.human_score)),
                human_comment=item.comment,
                submitted_at=now,
            )
            db.add(score)

    await db.flush()

    # Reload scores
    result = await db.execute(
        select(ReviewScore).where(ReviewScore.assignment_id == assignment.id)
    )
    all_scores = result.scalars().all()

    return [
        ScoreDimension(
            dimension=s.dimension,
            ai_score=s.ai_score,
            human_score=s.human_score,
            human_comment=s.human_comment,
        )
        for s in all_scores
    ]


# ── Complete review ──────────────────────────────────────────────────────────


async def complete_review(
    db: AsyncSession,
    application_id: uuid.UUID,
    reviewer_id: uuid.UUID,
) -> ReviewAssignment:
    """Mark a review assignment as completed.

    All dimensions must be scored. Checks if all reviewers have completed.
    """
    # Load assignment with scores
    assign_result = await db.execute(
        select(ReviewAssignment)
        .options(selectinload(ReviewAssignment.scores))
        .where(
            ReviewAssignment.application_id == application_id,
            ReviewAssignment.reviewer_id == reviewer_id,
        )
    )
    assignment = assign_result.scalar_one_or_none()
    if assignment is None:
        raise ValueError("No assignment found")

    if assignment.completed_at is not None:
        raise ValueError("Review already completed")

    # Verify all rubric dimensions are scored
    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one()

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    rubric = get_rubric(programme)
    scored_dims = {s.dimension for s in assignment.scores if s.human_score is not None}
    required_dims = {r["dimension"] for r in rubric}
    missing = required_dims - scored_dims
    if missing:
        raise ValueError(f"Missing scores for dimensions: {', '.join(sorted(missing))}")

    # Mark completed
    assignment.completed_at = datetime.now(timezone.utc)
    await db.flush()

    # Check if all reviewers for this application have completed
    all_assignments_result = await db.execute(
        select(ReviewAssignment).where(ReviewAssignment.application_id == application_id)
    )
    all_assignments = all_assignments_result.scalars().all()
    all_completed = all(a.completed_at is not None for a in all_assignments)

    if all_completed:
        application.status = ApplicationStatus.review_complete

    await db.flush()
    return assignment


# ── Post-review queue (staff) ────────────────────────────────────────────────


def _compute_composite(scores: list[ReviewScore], rubric: list[dict[str, Any]]) -> Decimal | None:
    """Weighted average of human scores."""
    weight_map = {r["dimension"]: r.get("weight", 0) for r in rubric}
    total_weight = 0
    weighted_sum = Decimal(0)

    for s in scores:
        if s.human_score is None:
            continue
        w = weight_map.get(s.dimension, 0)
        weighted_sum += s.human_score * w
        total_weight += w

    if total_weight == 0:
        return None
    return (weighted_sum / total_weight).quantize(Decimal("0.01"))


async def list_post_review_queue(
    db: AsyncSession,
    *,
    decision_filter: str | None = None,
) -> list[PostReviewQueueItem]:
    """List applications ready for post-review decisions."""
    review_statuses = [
        ApplicationStatus.review_complete,
        ApplicationStatus.approved,
        ApplicationStatus.rejected,
        ApplicationStatus.waitlisted,
    ]

    if decision_filter == "pending":
        review_statuses = [ApplicationStatus.review_complete]
    elif decision_filter in ("approved", "rejected", "waitlisted"):
        review_statuses = [ApplicationStatus(decision_filter)]

    q = (
        select(Application, GrantProgramme, User.full_name.label("applicant_name"))
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .join(User, User.id == Application.applicant_id)
        .where(Application.status.in_(review_statuses))
        .order_by(Application.updated_at.desc())
    )

    result = await db.execute(q)
    rows = result.all()

    items: list[PostReviewQueueItem] = []
    for application, programme, applicant_name in rows:
        # Load assignments with scores for each application
        assign_result = await db.execute(
            select(ReviewAssignment)
            .options(selectinload(ReviewAssignment.scores))
            .where(ReviewAssignment.application_id == application.id)
        )
        assignments = assign_result.scalars().all()

        rubric = get_rubric(programme)
        reviewer_scores: list[ReviewerScoreSet] = []
        all_composites: list[Decimal] = []

        for a in assignments:
            # Load reviewer name
            rev_result = await db.execute(
                select(User.full_name).where(User.id == a.reviewer_id)
            )
            rev_name = rev_result.scalar_one()

            comp = _compute_composite(a.scores, rubric)
            if comp is not None:
                all_composites.append(comp)

            reviewer_scores.append(ReviewerScoreSet(
                reviewer_id=a.reviewer_id,
                reviewer_name=rev_name,
                completed_at=a.completed_at,
                scores=[
                    ScoreDimension(
                        dimension=s.dimension,
                        ai_score=s.ai_score,
                        human_score=s.human_score,
                        human_comment=s.human_comment,
                    )
                    for s in a.scores
                ],
                composite_score=comp,
            ))

        # Average composite across reviewers
        avg_composite = None
        if all_composites:
            avg_composite = (sum(all_composites) / len(all_composites)).quantize(Decimal("0.01"))

        # Latest completion date
        completed_dates = [a.completed_at for a in assignments if a.completed_at]
        latest_completed = max(completed_dates) if completed_dates else None

        items.append(PostReviewQueueItem(
            application_id=application.id,
            reference_number=application.reference_number,
            programme_name=programme.name,
            programme_code=programme.code,
            applicant_name=applicant_name,
            status=application.status,
            reviewer_scores=reviewer_scores,
            composite_score=avg_composite,
            review_completed_at=latest_completed,
        ))

    # Sort by composite score desc
    items.sort(key=lambda x: x.composite_score or Decimal(0), reverse=True)
    return items


# ── Record post-review decision ──────────────────────────────────────────────


async def record_post_review_decision(
    db: AsyncSession,
    application_id: uuid.UUID,
    decision: str,
    reason: str,
) -> Application:
    """Record the programme officer's decision after review."""
    result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise ValueError("Application not found")

    if application.status != ApplicationStatus.review_complete:
        raise ValueError(f"Application must be in 'review_complete' status, currently '{application.status.value}'")

    status_map = {
        "approved": ApplicationStatus.approved,
        "rejected": ApplicationStatus.rejected,
        "waitlisted": ApplicationStatus.waitlisted,
    }

    new_status = status_map.get(decision)
    if new_status is None:
        raise ValueError(f"Invalid decision: {decision}")

    application.status = new_status

    # Store decision reason in form_data
    form = application.form_data or {}
    form["_decision_reason"] = reason
    form["_decision_at"] = datetime.now(timezone.utc).isoformat()
    application.form_data = form

    await db.flush()
    return application
