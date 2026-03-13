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
