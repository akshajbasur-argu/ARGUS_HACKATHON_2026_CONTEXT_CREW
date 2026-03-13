from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement applications service layer
# Suggested functions:
#   async def list_applications(db: AsyncSession, ...) -> list[Application]
#   async def get_application(db: AsyncSession, application_id: UUID) -> Application | None
#   async def create_application(db: AsyncSession, data: ApplicationCreate) -> Application
#   async def submit_application(db: AsyncSession, application: Application) -> Application
#   async def attach_document(db: AsyncSession, application: Application, file_path: str) -> ApplicationDocument
