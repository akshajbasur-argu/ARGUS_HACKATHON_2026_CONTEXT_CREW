from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement finance service layer
# Suggested functions:
#   async def record_disbursement(db: AsyncSession, data: DisbursementCreate) -> Disbursement
#   async def confirm_disbursement(db: AsyncSession, disbursement: Disbursement) -> Disbursement
#   async def get_budget_summary(db: AsyncSession, programme_id: UUID) -> BudgetSummary
#   async def generate_financial_report(db: AsyncSession, programme_id: UUID, fmt: str) -> bytes
