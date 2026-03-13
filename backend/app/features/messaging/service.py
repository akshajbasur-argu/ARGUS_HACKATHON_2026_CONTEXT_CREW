from sqlalchemy.ext.asyncio import AsyncSession  # noqa: F401

# TODO: Implement messaging service layer
# Suggested functions:
#   async def list_threads(db: AsyncSession, user_id: UUID) -> list[MessageThread]
#   async def create_thread(db: AsyncSession, data: ThreadCreate) -> MessageThread
#   async def send_message(db: AsyncSession, thread_id: UUID, sender_id: UUID, body: str) -> Message
#   async def create_notification(db: AsyncSession, user_id: UUID, title: str, body: str) -> Notification
#   async def mark_notification_read(db: AsyncSession, notification_id: UUID) -> Notification
