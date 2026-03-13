from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement review service layer
# Suggested functions:
#   async def create_panel(db: AsyncSession, data: ReviewPanelCreate) -> ReviewPanel
#   async def assign_reviewer(db: AsyncSession, panel_id: UUID, reviewer_id: UUID, application_id: UUID) -> ReviewAssignment
#   async def submit_score(db: AsyncSession, assignment_id: UUID, data: ScoreSubmit) -> ReviewScore
#   async def get_aggregate_scores(db: AsyncSession, application_id: UUID) -> AggregatedScores
