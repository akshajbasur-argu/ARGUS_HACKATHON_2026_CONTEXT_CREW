from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement compliance service layer
# Suggested functions:
#   async def list_requirements(db: AsyncSession, programme_id: UUID) -> list[ComplianceRequirement]
#   async def create_submission(db: AsyncSession, data: SubmissionCreate) -> ComplianceSubmission
#   async def review_submission(db: AsyncSession, submission: ComplianceSubmission, approved: bool) -> ComplianceSubmission
