"""Singleton Anthropic client with structured JSON calling, retry, and audit logging."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import anthropic
from jinja2 import Environment, FileSystemLoader

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Exceptions ───────────────────────────────────────────────────────────────


class AIServiceError(Exception):
    """Raised when the Anthropic API call fails after retries."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ── Jinja2 template loader ──────────────────────────────────────────────────

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    autoescape=False,
    keep_trailing_newline=True,
)


def render_prompt(template_name: str, **kwargs: Any) -> str:
    """Render a .j2 prompt template with the given variables."""
    template = _jinja_env.get_template(template_name)
    return template.render(**kwargs)


# ── Singleton client ────────────────────────────────────────────────────────

_client: anthropic.AsyncAnthropic | None = None

_MODEL = "claude-sonnet-4-6-20250514"
_MAX_RETRIES_ON_OVERLOAD = 3


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise AIServiceError("ANTHROPIC_API_KEY is not configured")
        _client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            max_retries=_MAX_RETRIES_ON_OVERLOAD,
        )
    return _client


# ── Core call function ──────────────────────────────────────────────────────


async def call_claude(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int = 2000,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Call Claude and return parsed JSON.

    The system prompt instructs the model to respond strictly in JSON.
    Raises ``AIServiceError`` on any non-recoverable failure.
    """
    client = _get_client()

    try:
        response = await client.messages.create(
            model=_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except anthropic.OverloadedError as exc:
        logger.warning("Anthropic overloaded (529) — retries exhausted")
        raise AIServiceError("AI service overloaded, please retry later", status_code=529) from exc
    except anthropic.APIError as exc:
        logger.error("Anthropic API error: %s", exc)
        raise AIServiceError(f"AI service error: {exc}", status_code=getattr(exc, "status_code", None)) from exc

    # Extract text block
    text = response.content[0].text

    # Log token usage
    usage = response.usage
    logger.info(
        "Claude usage — input: %d, output: %d tokens",
        usage.input_tokens,
        usage.output_tokens,
    )

    # Parse JSON response
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Claude JSON response: %s", text[:500])
        raise AIServiceError("AI returned invalid JSON") from exc
