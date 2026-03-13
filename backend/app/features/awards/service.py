from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement awards service layer
# Suggested functions:
#   async def create_award(db: AsyncSession, data: AwardCreate) -> Award
#   async def accept_award(db: AsyncSession, award: Award) -> Award
#   async def decline_award(db: AsyncSession, award: Award) -> Award
#   async def create_tranche(db: AsyncSession, award_id: UUID, amount: Decimal, due_date: date) -> AwardTranche
