"""Auth service — user CRUD, OTP generation/verification, audit logging."""

from __future__ import annotations

import random
import string
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.redis import get_redis
from app.core.security import hash_password, verify_password
from app.features.admin.models import AuditLog
from app.features.auth.models import Organisation, User
from app.features.auth.schemas import RegisterRequest


# ── User CRUD ────────────────────────────────────────────────────────────────


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(
        select(User)
        .options(selectinload(User.organisation))
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: RegisterRequest) -> User:
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
    )
    db.add(user)
    await db.flush()

    org = Organisation(
        user_id=user.id,
        legal_name=data.legal_name,
        registration_number=data.registration_number,
        org_type=data.org_type,
        year_established=data.year_established,
        state=data.state,
        annual_budget_inr=data.annual_budget_inr,
        contact_person=data.contact_person,
    )
    db.add(org)
    await db.flush()
    return user


async def authenticate_user(
    db: AsyncSession, email: str, password: str
) -> User | None:
    user = await get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


# ── OTP ──────────────────────────────────────────────────────────────────────


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=settings.OTP_LENGTH))


async def store_otp(email: str) -> str:
    otp = _generate_otp()
    r = get_redis()
    key = f"otp:{email}"
    await r.set(key, otp, ex=settings.OTP_TTL_SECONDS)
    # Print to console for hackathon demo (no email provider)
    print(f"\n{'=' * 50}")
    print(f"  OTP for {email}: {otp}")
    print(f"{'=' * 50}\n")
    return otp


async def verify_otp(email: str, otp: str) -> bool:
    r = get_redis()
    key = f"otp:{email}"
    stored = await r.get(key)
    if stored is None or stored != otp:
        return False
    await r.delete(key)
    return True


# ── Token blacklist ──────────────────────────────────────────────────────────


async def blacklist_refresh_token(jti: str, ttl_seconds: int) -> None:
    r = get_redis()
    await r.set(f"blacklist:{jti}", "1", ex=ttl_seconds)


async def is_token_blacklisted(jti: str) -> bool:
    r = get_redis()
    return await r.exists(f"blacklist:{jti}") > 0


# ── Audit logging ────────────────────────────────────────────────────────────


async def write_audit_log(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    object_type: str,
    object_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        metadata_json=metadata or {},
    )
    db.add(log)
    await db.flush()
