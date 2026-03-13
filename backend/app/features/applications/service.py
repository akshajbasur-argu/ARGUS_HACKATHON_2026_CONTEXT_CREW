"""Applications service — CRUD, validation, submission, timeline."""

from __future__ import annotations

import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ApplicationStatus
from app.features.applications.models import Application, Document
from app.features.applications.schemas import (
    ApplicationCreate,
    ApplicationListItem,
    ApplicationRead,
    ApplicationTimeline,
    ApplicationUpdate,
    DocumentRead,
    SubmitValidationError,
    TimelineEvent,
)
from app.features.programmes.models import GrantProgramme


# ── Reference number ─────────────────────────────────────────────────────────


def _generate_ref() -> str:
    """Generate a human-readable reference like GF-2026-AB34XZ."""
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    year = datetime.now(timezone.utc).year
    return f"GF-{year}-{suffix}"


# ── List ─────────────────────────────────────────────────────────────────────


async def list_applications(
    db: AsyncSession,
    applicant_id: uuid.UUID,
    *,
    programme_id: uuid.UUID | None = None,
    status_filter: ApplicationStatus | None = None,
) -> list[ApplicationListItem]:
    """List applications for an applicant with optional filters."""
    q = (
        select(Application, GrantProgramme.name)
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .where(Application.applicant_id == applicant_id)
        .order_by(Application.updated_at.desc())
    )
    if programme_id:
        q = q.where(Application.programme_id == programme_id)
    if status_filter:
        q = q.where(Application.status == status_filter)

    result = await db.execute(q)
    rows = result.all()

    return [
        ApplicationListItem(
            id=app.id,
            reference_number=app.reference_number,
            programme_id=app.programme_id,
            programme_name=prog_name,
            status=app.status,
            submitted_at=app.submitted_at,
            updated_at=app.updated_at,
        )
        for app, prog_name in rows
    ]


# ── Get ──────────────────────────────────────────────────────────────────────


async def get_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
) -> ApplicationRead | None:
    """Get application detail, optionally scoped to an applicant."""
    q = (
        select(Application, GrantProgramme.name)
        .join(GrantProgramme, GrantProgramme.id == Application.programme_id)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
    )
    if applicant_id:
        q = q.where(Application.applicant_id == applicant_id)

    result = await db.execute(q)
    row = result.first()
    if row is None:
        return None

    app, prog_name = row

    return ApplicationRead(
        id=app.id,
        reference_number=app.reference_number,
        programme_id=app.programme_id,
        programme_name=prog_name,
        applicant_id=app.applicant_id,
        status=app.status,
        form_data=app.form_data,
        submitted_at=app.submitted_at,
        updated_at=app.updated_at,
        documents=[
            DocumentRead(
                id=d.id,
                doc_type=d.doc_type,
                filename=d.filename,
                uploaded_at=d.uploaded_at,
            )
            for d in app.documents
        ],
    )


# ── Create ───────────────────────────────────────────────────────────────────


async def create_application(
    db: AsyncSession,
    applicant_id: uuid.UUID,
    data: ApplicationCreate,
) -> Application:
    """Create a new draft application."""
    # Verify programme exists and is active
    prog = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == data.programme_id)
    )
    programme = prog.scalar_one_or_none()
    if programme is None or not programme.is_active:
        raise ValueError("Programme not found or inactive")

    app = Application(
        reference_number=_generate_ref(),
        programme_id=data.programme_id,
        applicant_id=applicant_id,
        status=ApplicationStatus.submitted,  # draft state uses submitted
        form_data=data.form_data,
    )
    db.add(app)
    await db.flush()
    return app


# ── Update (draft save) ─────────────────────────────────────────────────────


async def update_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    applicant_id: uuid.UUID,
    data: ApplicationUpdate,
) -> Application | None:
    """Update form_data for a draft application (auto-save)."""
    result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .where(Application.applicant_id == applicant_id)
    )
    app = result.scalar_one_or_none()
    if app is None:
        return None

    # Only allow update if in draft/submitted state
    if app.status not in (ApplicationStatus.submitted,):
        raise ValueError(f"Cannot update application in '{app.status.value}' state")

    app.form_data = data.form_data
    await db.flush()
    return app


# ── Submit validation ────────────────────────────────────────────────────────


REQUIRED_FIELDS = [
    "project_title",
    "problem_statement",
    "proposed_solution",
    "expected_outcomes",
    "target_beneficiaries",
    "team_description",
    "budget_total",
    "budget_breakdown",
    "duration_months",
]


def validate_for_submit(
    form_data: dict[str, Any],
    programme: GrantProgramme,
    doc_count: int,
) -> list[SubmitValidationError]:
    """Run all validation checks before final submission."""
    errors: list[SubmitValidationError] = []

    # 1. Required fields
    for field in REQUIRED_FIELDS:
        val = form_data.get(field)
        if not val or (isinstance(val, str) and not val.strip()):
            errors.append(SubmitValidationError(
                field=field,
                message=f"{field.replace('_', ' ').title()} is required",
            ))

    # 2. Budget arithmetic
    budget = form_data.get("budget_breakdown", {})
    if isinstance(budget, dict):
        personnel = Decimal(str(budget.get("personnel", 0)))
        equipment = Decimal(str(budget.get("equipment", 0)))
        travel = Decimal(str(budget.get("travel", 0)))
        overheads = Decimal(str(budget.get("overheads", 0)))
        other = Decimal(str(budget.get("other", 0)))
        computed_total = personnel + equipment + travel + overheads + other

        budget_total = Decimal(str(form_data.get("budget_total", 0)))
        if abs(computed_total - budget_total) > 500:
            errors.append(SubmitValidationError(
                field="budget_total",
                message=(
                    f"Budget total (₹{budget_total:,.0f}) does not match line items "
                    f"(₹{computed_total:,.0f}). Difference must be within ₹500."
                ),
            ))

        # Overhead <= 15%
        if budget_total > 0 and overheads / budget_total > Decimal("0.15"):
            pct = (overheads / budget_total * 100).quantize(Decimal("0.1"))
            errors.append(SubmitValidationError(
                field="budget_breakdown.overheads",
                message=f"Overhead is {pct}% of total. Maximum allowed is 15%.",
            ))

    # 3. Budget within programme range
    budget_total = Decimal(str(form_data.get("budget_total", 0)))
    if budget_total > 0:
        if budget_total < programme.funding_min_inr:
            errors.append(SubmitValidationError(
                field="budget_total",
                message=f"Budget below programme minimum (₹{programme.funding_min_inr:,.0f})",
            ))
        if budget_total > programme.funding_max_inr:
            errors.append(SubmitValidationError(
                field="budget_total",
                message=f"Budget exceeds programme maximum (₹{programme.funding_max_inr:,.0f})",
            ))

    # 4. Duration within programme range
    duration = form_data.get("duration_months")
    if duration:
        dur = int(duration)
        if dur < programme.duration_min_months or dur > programme.duration_max_months:
            errors.append(SubmitValidationError(
                field="duration_months",
                message=(
                    f"Duration must be {programme.duration_min_months}–"
                    f"{programme.duration_max_months} months"
                ),
            ))

    # 5. Minimum documents
    programme_meta = programme.metadata_json or {}
    min_docs = programme_meta.get("min_documents", 1)
    if doc_count < min_docs:
        errors.append(SubmitValidationError(
            field="documents",
            message=f"At least {min_docs} document(s) required, {doc_count} attached",
        ))

    return errors


# ── Submit ───────────────────────────────────────────────────────────────────


async def submit_application(
    db: AsyncSession,
    application_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> tuple[Application, list[SubmitValidationError]]:
    """Validate and submit an application. Returns (app, errors)."""
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.documents))
        .where(Application.id == application_id)
        .where(Application.applicant_id == applicant_id)
    )
    app = result.scalar_one_or_none()
    if app is None:
        raise ValueError("Application not found")

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == app.programme_id)
    )
    programme = prog_result.scalar_one()

    errors = validate_for_submit(
        app.form_data or {},
        programme,
        len(app.documents),
    )

    if errors:
        return app, errors

    app.status = ApplicationStatus.submitted
    app.submitted_at = datetime.now(timezone.utc)
    await db.flush()

    return app, []


# ── Attach document ──────────────────────────────────────────────────────────


async def attach_document_to_app(
    db: AsyncSession,
    application_id: uuid.UUID,
    document_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> Document | None:
    """Link a vault document to an application."""
    # Verify application ownership
    app_result = await db.execute(
        select(Application)
        .where(Application.id == application_id)
        .where(Application.applicant_id == applicant_id)
    )
    app = app_result.scalar_one_or_none()
    if app is None:
        return None

    # Verify document ownership
    doc_result = await db.execute(
        select(Document)
        .where(Document.id == document_id)
        .where(Document.user_id == applicant_id)
    )
    doc = doc_result.scalar_one_or_none()
    if doc is None:
        return None

    # Create a copy linked to the application
    attached = Document(
        application_id=application_id,
        user_id=applicant_id,
        doc_type=doc.doc_type,
        filename=doc.filename,
        storage_path=doc.storage_path,
        is_vault_doc=False,
    )
    db.add(attached)
    await db.flush()
    return attached


# ── Timeline ─────────────────────────────────────────────────────────────────

STAGE_ORDER = [
    ("submitted", "Application Submitted"),
    ("screening", "AI Screening"),
    ("eligible", "Eligibility Confirmed"),
    ("under_review", "Expert Review"),
    ("review_complete", "Review Complete"),
    ("approved", "Approved"),
    ("agreement_sent", "Agreement Sent"),
    ("active", "Grant Active"),
]


async def get_application_timeline(
    db: AsyncSession,
    application_id: uuid.UUID,
) -> ApplicationTimeline | None:
    """Build a stage timeline for the application."""
    result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    app = result.scalar_one_or_none()
    if app is None:
        return None

    current = app.status.value
    events: list[TimelineEvent] = []

    found_current = False
    for stage_val, label in STAGE_ORDER:
        is_current = stage_val == current
        if is_current:
            found_current = True

        # Stages before current are completed
        if not found_current and not is_current:
            events.append(TimelineEvent(
                stage=stage_val,
                label=label,
                occurred_at=app.submitted_at,
            ))
        elif is_current:
            # SLA: 5 business days from last update
            sla = (app.updated_at + timedelta(days=5)).strftime("%d %b %Y")
            events.append(TimelineEvent(
                stage=stage_val,
                label=label,
                occurred_at=app.updated_at,
                is_current=True,
                sla_date=f"Expected by {sla}",
            ))
        else:
            # Future stages
            events.append(TimelineEvent(
                stage=stage_val,
                label=label,
            ))

    # Handle terminal states not in STAGE_ORDER
    if current in ("ineligible", "rejected", "waitlisted", "closed"):
        events.append(TimelineEvent(
            stage=current,
            label=current.replace("_", " ").title(),
            occurred_at=app.updated_at,
            is_current=True,
        ))

    return ApplicationTimeline(application_id=application_id, events=events)
