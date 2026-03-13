"""Staff API endpoints — aggregated views for internal users."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import ApplicationStatus, UserRole
from app.features.applications.schemas import ApplicationListItem
from app.features.applications.service import list_all_applications
from app.features.auth.dependencies import require_role
from app.features.auth.models import User

router = APIRouter()


@router.get("/applications", response_model=list[ApplicationListItem])
async def list_staff_applications(
    _user: Annotated[
        User,
        Depends(
            require_role(
                UserRole.platform_admin,
                UserRole.program_officer,
                UserRole.reviewer,
                UserRole.finance_officer,
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    programme_id: uuid.UUID | None = None,
    status_filter: ApplicationStatus | None = None,
) -> list[ApplicationListItem]:
    """List all applications for staff oversight."""
    return await list_all_applications(
        db, programme_id=programme_id, status_filter=status_filter
    )
