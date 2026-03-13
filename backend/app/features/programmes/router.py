"""Programmes router — public endpoints (no auth required)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.programmes import service
from app.features.programmes.schemas import (
    PrecheckRequest,
    PrecheckResultItem,
    ProgrammeDetail,
    ProgrammeListItem,
)

router = APIRouter()


@router.get(
    "",
    response_model=list[ProgrammeListItem],
    summary="List active grant programmes",
    description="Returns all active grant programmes. No authentication required.",
)
async def list_programmes(
    db: AsyncSession = Depends(get_db),
) -> list[ProgrammeListItem]:
    return await service.list_programmes(db)


@router.get(
    "/{programme_id}",
    response_model=ProgrammeDetail,
    summary="Get programme detail",
    description="Returns the full detail of a single programme by UUID.",
)
async def get_programme(
    programme_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ProgrammeDetail:
    programme = await service.get_programme(db, programme_id)
    if programme is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Programme {programme_id} not found.",
        )
    return programme


@router.post(
    "/precheck",
    response_model=list[PrecheckResultItem],
    summary="Eligibility pre-check",
    description=(
        "Evaluates hard eligibility rules for one or all active programmes. "
        "No authentication required."
    ),
)
async def precheck_eligibility(
    req: PrecheckRequest,
    db: AsyncSession = Depends(get_db),
) -> list[PrecheckResultItem]:
    return await service.precheck_eligibility(db, req)
