"""Admin service — user management and audit log queries."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.security import hash_password
from app.features.admin.models import AuditLog
from app.features.auth.models import User


# ── User management ──────────────────────────────────────────────────────────


async def list_users(db: AsyncSession) -> list[User]:
    """List all users ordered by creation date."""
    result = await db.execute(
        select(User).order_by(User.created_at.desc())
    )
    return list(result.scalars().all())


async def create_staff_user(
    db: AsyncSession,
    *,
    full_name: str,
    email: str,
    role: UserRole,
    phone: str | None = None,
) -> User:
    """Create a staff account with a random initial password."""
    # Check for duplicate email
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise ValueError("A user with this email already exists.")

    # Staff roles only
    staff_roles = {
        UserRole.program_officer,
        UserRole.reviewer,
        UserRole.finance_officer,
        UserRole.platform_admin,
    }
    if role not in staff_roles:
        raise ValueError(f"Invalid staff role: {role.value}")

    import secrets
    temp_password = secrets.token_urlsafe(16)

    user = User(
        email=email,
        hashed_password=hash_password(temp_password),
        full_name=full_name,
        phone=phone,
        role=role,
    )
    db.add(user)
    await db.flush()

    # Print temp password for hackathon demo
    print(f"\n{'=' * 50}")
    print(f"  NEW STAFF ACCOUNT")
    print(f"  Email:    {email}")
    print(f"  Password: {temp_password}")
    print(f"  Role:     {role.value}")
    print(f"{'=' * 50}\n")

    return user


async def deactivate_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> User:
    """Deactivate a user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError("User not found.")

    if not user.is_active:
        raise ValueError("User is already deactivated.")

    user.is_active = False
    await db.flush()
    return user


# ── Audit log ────────────────────────────────────────────────────────────────


async def list_audit_logs(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 50,
    actor_email: str | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[dict], int]:
    """Paginated audit log with optional filters. Returns (items, total_count)."""
    query = (
        select(AuditLog, User)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .order_by(AuditLog.created_at.desc())
    )

    count_query = select(sa_func.count(AuditLog.id))

    # Apply filters
    if actor_email:
        query = query.where(User.email.ilike(f"%{actor_email}%"))
        count_query = count_query.join(User, AuditLog.actor_id == User.id).where(
            User.email.ilike(f"%{actor_email}%")
        )

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)

    if date_from:
        query = query.where(AuditLog.created_at >= date_from)
        count_query = count_query.where(AuditLog.created_at >= date_from)

    if date_to:
        query = query.where(AuditLog.created_at <= date_to)
        count_query = count_query.where(AuditLog.created_at <= date_to)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    items = [
        {
            "id": log.id,
            "actor_id": log.actor_id,
            "actor_email": user.email if user else None,
            "action": log.action,
            "object_type": log.object_type,
            "object_id": log.object_id,
            "metadata_json": log.metadata_json,
            "created_at": log.created_at,
        }
        for log, user in rows
    ]

    return items, total


# ── Template management ──────────────────────────────────────────────────────


async def seed_default_templates(db: AsyncSession) -> None:
    """Seed default letter templates if they don't exist."""
    from app.features.admin.models import LetterTemplate

    result = await db.execute(select(LetterTemplate))
    existing = {t.code for t in result.scalars().all()}

    defaults = [
        {
            "code": "award",
            "name": "Award Letter",
            "required_fields": [
                "award_date", "grant_reference", "contact_person",
                "programme_name", "grantee_organisation_name", "project_title",
                "award_amount", "start_date", "end_date",
                "special_conditions", "decision_reasons",
            ],
        },
        {
            "code": "rejection",
            "name": "Rejection Letter",
            "required_fields": [
                "decision_date", "grant_reference", "contact_person",
                "programme_name", "project_title", "rejection_reasons",
            ],
        },
        {
            "code": "agreement",
            "name": "Grant Agreement",
            "required_fields": [
                "grantee_organisation_name", "registration_number", "state",
                "grant_reference", "programme_name", "programme_code",
                "project_title", "award_amount", "start_date", "end_date",
                "award_date", "tranche_table", "special_conditions",
            ],
        },
    ]

    from app.features.awards.service import (
        AWARD_LETTER_TEMPLATE,
        REJECTION_LETTER_TEMPLATE,
        AGREEMENT_TEMPLATE,
    )

    template_bodies = {
        "award": AWARD_LETTER_TEMPLATE,
        "rejection": REJECTION_LETTER_TEMPLATE,
        "agreement": AGREEMENT_TEMPLATE,
    }

    for d in defaults:
        if d["code"] not in existing:
            t = LetterTemplate(
                code=d["code"],
                name=d["name"],
                body_text=template_bodies[d["code"]],
                required_fields=d["required_fields"],
            )
            db.add(t)

    await db.flush()


async def list_templates(db: AsyncSession) -> list:
    """List all letter templates."""
    from app.features.admin.models import LetterTemplate

    result = await db.execute(
        select(LetterTemplate).order_by(LetterTemplate.code)
    )
    return list(result.scalars().all())


async def get_template(db: AsyncSession, code: str):
    """Get a single template by code."""
    from app.features.admin.models import LetterTemplate

    result = await db.execute(
        select(LetterTemplate).where(LetterTemplate.code == code)
    )
    return result.scalar_one_or_none()


async def update_template(db: AsyncSession, code: str, body_text: str) -> tuple[bool, list[str]]:
    """Update template body_text. Returns (success, missing_fields)."""
    import re
    from app.features.admin.models import LetterTemplate

    result = await db.execute(
        select(LetterTemplate).where(LetterTemplate.code == code)
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise ValueError(f"Template '{code}' not found")

    # Validate required merge fields are present
    present_fields = set(re.findall(r"\{\{(.+?)\}\}", body_text))
    present_fields = {f.strip() for f in present_fields}
    required = set(template.required_fields or [])
    missing = required - present_fields

    if missing:
        return False, sorted(missing)

    template.body_text = body_text
    await db.flush()
    return True, []
