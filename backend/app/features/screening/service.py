from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement screening service layer
# Suggested functions:
#   async def get_screening_result(db: AsyncSession, application_id: UUID) -> ScreeningResult | None
#   async def record_decision(db: AsyncSession, application_id: UUID, outcome: str, ...) -> ScreeningResult
#   async def trigger_ai_screening(application_ids: list[UUID]) -> str  # returns Celery task_id
