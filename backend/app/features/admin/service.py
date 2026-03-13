from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement admin service layer
# Suggested functions:
#   async def list_users(db: AsyncSession, *, skip: int, limit: int) -> list[User]
#   async def write_audit_log(db: AsyncSession, actor_id: UUID, action: str, ...) -> AuditLog
#   async def get_system_stats(db: AsyncSession) -> SystemStats
#   async def toggle_feature_flag(db: AsyncSession, key: str, enabled: bool) -> FeatureFlag
