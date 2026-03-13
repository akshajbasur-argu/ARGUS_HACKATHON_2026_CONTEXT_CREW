"""Chatbot-guided application intake service.

Drives a conversational flow that collects application fields one at a time
using OpenAI, with programme-specific field definitions.
"""

from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.openai_client import AIServiceError, call_openai, render_prompt
from app.features.applications.schemas import (
    ChatIntakeRequest,
    ChatIntakeResponse,
    FieldCapture,
)
from app.features.programmes.models import GrantProgramme

logger = logging.getLogger(__name__)

# ── Programme-specific field definitions ─────────────────────────────────────

# CDG = Community Development Grant
# EIG = Education Innovation Grant
# ECAG = Environment & Climate Action Grant

_DEFAULT_FIELDS = [
    {"name": "project_title", "label": "Project Title", "type": "text",
     "description": "A clear, concise title for your project (max 150 chars)"},
    {"name": "problem_statement", "label": "Problem Statement", "type": "textarea",
     "description": "Describe the problem your project addresses (200-500 words)"},
    {"name": "proposed_solution", "label": "Proposed Solution", "type": "textarea",
     "description": "Describe your proposed approach to solving the problem (200-500 words)"},
    {"name": "expected_outcomes", "label": "Expected Outcomes", "type": "textarea",
     "description": "List 3-5 measurable outcomes with specific indicators"},
    {"name": "target_beneficiaries", "label": "Target Beneficiaries", "type": "textarea",
     "description": "Who will benefit? Include estimated numbers, demographics, and location"},
    {"name": "implementation_timeline", "label": "Implementation Timeline", "type": "textarea",
     "description": "Month-by-month or quarter-by-quarter activity plan"},
    {"name": "team_description", "label": "Team Description", "type": "textarea",
     "description": "Key team members, their roles, and relevant experience"},
    {"name": "budget_total", "label": "Total Budget Requested (INR)", "type": "number",
     "description": "Total amount requested in Indian Rupees"},
    {"name": "budget_breakdown", "label": "Budget Breakdown", "type": "textarea",
     "description": "Major budget line items with amounts (e.g., Personnel, Travel, Equipment)"},
    {"name": "duration_months", "label": "Project Duration (months)", "type": "number",
     "description": "How many months will the project take?"},
    {"name": "sustainability_plan", "label": "Sustainability Plan", "type": "textarea",
     "description": "How will the project outcomes be sustained after the grant period?"},
    {"name": "prior_experience", "label": "Prior Grant Experience", "type": "textarea",
     "description": "Describe any previous grants received and their outcomes"},
]

_PROGRAMME_EXTRA_FIELDS: dict[str, list[dict]] = {
    "CDG": [
        {"name": "community_engagement", "label": "Community Engagement Strategy", "type": "textarea",
         "description": "How will you engage the community in planning and implementation?"},
    ],
    "EIG": [
        {"name": "innovation_description", "label": "Innovation Description", "type": "textarea",
         "description": "What makes your educational approach innovative?"},
        {"name": "scalability_plan", "label": "Scalability Plan", "type": "textarea",
         "description": "How can this innovation be scaled to other schools or regions?"},
    ],
    "ECAG": [
        {"name": "environmental_impact", "label": "Environmental Impact Assessment", "type": "textarea",
         "description": "Expected environmental impact with quantifiable metrics"},
        {"name": "climate_relevance", "label": "Climate Relevance", "type": "textarea",
         "description": "How does this project address climate change adaptation or mitigation?"},
    ],
}

_SYSTEM_PROMPT = (
    "You are a friendly grant application assistant for GrantFlow. "
    "You help applicants fill out their grant application through conversation. "
    "You MUST respond with ONLY valid JSON. "
    "No markdown, no commentary, no code fences."
)


def _get_fields_for_programme(programme_code: str) -> list[dict]:
    """Get the full field list for a programme."""
    fields = list(_DEFAULT_FIELDS)
    extra = _PROGRAMME_EXTRA_FIELDS.get(programme_code, [])
    fields.extend(extra)
    return fields


def _compute_progress(captured: dict, fields: list[dict]) -> int:
    """Compute progress percentage from captured fields."""
    total = len(fields)
    if total == 0:
        return 100
    captured_count = sum(1 for f in fields if f["name"] in captured)
    return int(captured_count / total * 100)


def _find_next_field(
    captured: dict, fields: list[dict], current_field: str | None
) -> str | None:
    """Find the next uncaptured field."""
    for f in fields:
        if f["name"] not in captured:
            return f["name"]
    return None


# ── Main chat handler ────────────────────────────────────────────────────────


async def handle_chat_intake(
    request: ChatIntakeRequest,
    db: AsyncSession,
) -> ChatIntakeResponse:
    """Process one turn of the chatbot intake conversation.

    1. Load programme to get field definitions
    2. Extract already-captured fields from conversation history
    3. Call OpenAI with chatbot_intake.j2 prompt
    4. Parse response and return structured ChatIntakeResponse
    """
    # Load programme
    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == request.programme_id)
    )
    programme = prog_result.scalar_one_or_none()
    if programme is None:
        return ChatIntakeResponse(
            assistant_message="I couldn't find that grant programme. Please check the programme ID and try again.",
            progress_pct=0,
            complete=False,
        )

    fields = _get_fields_for_programme(programme.code)

    # Build captured fields from conversation context
    # (In a real app these would be stored server-side; here we reconstruct)
    captured_fields = _extract_captured_from_history(request.conversation_history)

    current_field = request.current_field or _find_next_field(captured_fields, fields, None)
    progress_pct = _compute_progress(captured_fields, fields)

    # Check if already complete
    if progress_pct >= 100:
        return ChatIntakeResponse(
            assistant_message=(
                "Your application is complete! All fields have been captured. "
                "You can now review your responses and submit the application."
            ),
            progress_pct=100,
            complete=True,
        )

    # Build field definitions string for the prompt
    field_defs_str = json.dumps(fields, indent=2)
    captured_json = json.dumps(captured_fields, indent=2, default=str)

    # Build conversation for prompt
    conversation_history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    # If this is the first message, add a starter
    if not conversation_history:
        conversation_history = [
            {"role": "user", "content": "Hi, I'd like to start my grant application."}
        ]

    # Render prompt and call OpenAI
    user_prompt = render_prompt(
        "chatbot_intake.j2",
        programme_name=programme.name,
        field_definitions=field_defs_str,
        current_field=current_field,
        captured_fields_json=captured_json,
        fields_completed=len(captured_fields),
        fields_total=len(fields),
        conversation_history=conversation_history,
    )

    try:
        ai_result = await call_openai(
            _SYSTEM_PROMPT, user_prompt, max_tokens=1000, temperature=0.3
        )
    except AIServiceError:
        logger.error("Chatbot AI call failed", exc_info=True)
        return ChatIntakeResponse(
            assistant_message=(
                "I'm having trouble processing your response right now. "
                "Please try again in a moment, or switch to the form view to continue."
            ),
            next_field=current_field,
            progress_pct=progress_pct,
            complete=False,
        )

    # Parse AI response
    field_captured = None
    ai_captured = ai_result.get("field_captured")
    if ai_captured and isinstance(ai_captured, dict):
        field_captured = FieldCapture(
            field_name=ai_captured.get("field_name", ""),
            value=ai_captured.get("value", ""),
        )

    return ChatIntakeResponse(
        assistant_message=ai_result.get(
            "assistant_message",
            "Could you please provide more details?",
        ),
        field_captured=field_captured,
        next_field=ai_result.get("next_field", current_field),
        progress_pct=ai_result.get("progress_pct", progress_pct),
        complete=ai_result.get("complete", False),
    )


def _extract_captured_from_history(
    conversation: list,
) -> dict:
    """Extract field captures embedded in the conversation.

    In a production system, captured fields would be stored server-side.
    For the hackathon demo, we parse assistant messages that contain
    JSON capture markers.
    """
    captured: dict = {}
    for msg in conversation:
        if hasattr(msg, "content"):
            content = msg.content
        else:
            content = str(msg)

        # Look for capture markers in assistant messages
        if hasattr(msg, "role") and msg.role == "assistant":
            try:
                data = json.loads(content)
                if isinstance(data, dict) and "field_captured" in data:
                    fc = data["field_captured"]
                    if fc and isinstance(fc, dict):
                        captured[fc["field_name"]] = fc["value"]
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

    return captured
