from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement programme service layer
# Suggested functions:
#   async def list_programmes(db: AsyncSession, *, skip: int, limit: int) -> list[Programme]
#   async def get_programme(db: AsyncSession, programme_id: UUID) -> Programme | None
#   async def create_programme(db: AsyncSession, data: ProgrammeCreate) -> Programme
#   async def update_programme(db: AsyncSession, programme: Programme, data: ProgrammeUpdate) -> Programme
#   async def set_status(db: AsyncSession, programme: Programme, status: str) -> Programme
