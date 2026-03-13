"""Auth API endpoints — register, verify-otp, login, refresh, me, logout."""

from __future__ import annotations

import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.features.auth.dependencies import require_applicant, require_auth
from app.features.auth.models import User
from app.features.auth.schemas import (
    LoginRequest,
    MessageResponse,
    OrganisationRead,
    OrganisationUpdate,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserWithOrgRead,
    VerifyOTPRequest,
)
from app.features.auth.service import (
    authenticate_user,
    blacklist_refresh_token,
    create_user,
    get_user_by_email,
    get_user_by_id,
    is_token_blacklisted,
    store_otp,
    verify_otp,
    write_audit_log,
)

router = APIRouter()


# ── POST /register ───────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await get_user_by_email(db, body.email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = await create_user(db, body)
    await store_otp(body.email, user_id=user.id)
    await db.commit()
    return MessageResponse(detail="Registration successful. Check console for OTP.")


# ── POST /verify-otp ────────────────────────────────────────────────────────


@router.post("/verify-otp", response_model=MessageResponse)
async def verify_otp_endpoint(
    body: VerifyOTPRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    valid = await verify_otp(body.email, body.otp)
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )
    return MessageResponse(detail="Email verified successfully.")


# ── POST /login ──────────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await authenticate_user(db, body.email, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access = create_access_token(user.id, user.role.value, user.email)
    refresh = create_refresh_token(user.id)

    await write_audit_log(
        db,
        actor_id=user.id,
        action="login",
        object_type="user",
        object_id=str(user.id),
        metadata={"email": user.email},
    )
    await db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


# ── POST /refresh ────────────────────────────────────────────────────────────


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    # Blacklist the consumed refresh token
    if jti:
        exp = payload.get("exp", 0)
        remaining = max(int(exp - time.time()), 0)
        await blacklist_refresh_token(jti, remaining)

    user_id = uuid.UUID(payload["sub"])
    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    access = create_access_token(user.id, user.role.value, user.email)
    new_refresh = create_refresh_token(user.id)
    return TokenResponse(access_token=access, refresh_token=new_refresh)


# ── GET /me ──────────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserWithOrgRead)
async def me(current_user: Annotated[User, Depends(require_auth)]):
    return current_user


# ── POST /logout ─────────────────────────────────────────────────────────────


@router.post("/logout", response_model=MessageResponse)
async def logout(
    body: RefreshRequest,
    current_user: Annotated[User, Depends(require_auth)],
):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token type",
        )

    jti = payload.get("jti")
    if jti:
        exp = payload.get("exp", 0)
        remaining = max(int(exp - time.time()), 0)
        await blacklist_refresh_token(jti, remaining)

    return MessageResponse(detail="Logged out successfully.")


# ── GET /organisations/me ────────────────────────────────────────────────────


@router.get("/organisations/me", response_model=OrganisationRead)
async def get_my_org(
    current_user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get the current user's organisation profile."""
    from app.features.auth.service import get_organisation_by_user

    org = await get_organisation_by_user(db, current_user.id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organisation not found",
        )
    return org


# ── PUT /organisations/me ────────────────────────────────────────────────────


@router.put("/organisations/me", response_model=OrganisationRead)
async def update_my_org(
    body: OrganisationUpdate,
    current_user: Annotated[User, Depends(require_auth)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create or update the current user's organisation profile."""
    from app.features.auth.service import upsert_organisation

    org = await upsert_organisation(db, current_user.id, body)
    await db.commit()
    return org


# ── GET /organisations/me/eligibility ───────────────────────────────────


@router.get("/organisations/me/eligibility")
async def get_my_eligibility(
    current_user: Annotated[User, Depends(require_applicant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Personalised eligibility banner — run hard rules against org profile."""
    from decimal import Decimal

    from app.features.auth.service import get_organisation_by_user
    from app.features.programmes.service import list_programmes
    from app.features.programmes.seeds import RULE_CHECKERS

    org = await get_organisation_by_user(db, current_user.id)
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organisation profile not found. Complete your profile first.",
        )

    # Determine if profile is sufficiently complete
    if not org.org_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Organisation type is required for eligibility check.",
        )

    programmes = await list_programmes(db)
    budget = Decimal(str(org.annual_budget_inr)) if org.annual_budget_inr else Decimal("0")

    results = []
    for prog in programmes:
        checker = RULE_CHECKERS.get(prog.code)
        if checker is None:
            results.append({
                "programme_id": str(prog.id),
                "programme_code": prog.code,
                "programme_name": prog.name,
                "result": "likely_eligible",
                "failed_rules": [],
            })
            continue

        failed = checker(
            org.org_type.value if hasattr(org.org_type, "value") else str(org.org_type),
            org.state or "",
            budget,
        )
        results.append({
            "programme_id": str(prog.id),
            "programme_code": prog.code,
            "programme_name": prog.name,
            "result": "likely_eligible" if not failed else "likely_ineligible",
            "failed_rules": failed,
        })

    return results
