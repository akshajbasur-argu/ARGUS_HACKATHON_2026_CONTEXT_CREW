from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.features.applications.chatbot_service import handle_chat_intake
from app.features.applications.schemas import ChatIntakeRequest, ChatIntakeResponse
from app.features.auth.dependencies import require_auth, require_role
from app.features.auth.models import User

router = APIRouter()

# TODO: GET  /                     — list applications (filter by programme/status)
# TODO: POST /                     — submit a new application
# TODO: GET  /{id}                 — get application detail
# TODO: PUT  /{id}                 — update draft application
# TODO: POST /{id}/submit          — finalise and submit application
# TODO: POST /{id}/withdraw        — withdraw application
# TODO: GET  /{id}/documents       — list attached documents
# TODO: POST /{id}/documents       — attach a document


# ── Chatbot Intake ───────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatIntakeResponse)
async def chatbot_intake(
    body: ChatIntakeRequest,
    user: Annotated[User, Depends(require_role(UserRole.applicant))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatIntakeResponse:
    """AI-guided conversational application intake.

    Collects application fields one at a time through natural conversation.
    The applicant sends messages and the assistant guides them through each
    required field for the selected programme.
    """
    return await handle_chat_intake(body, db)
