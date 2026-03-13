"""Singleton OpenAI client with structured JSON calling, retry, and audit logging."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import openai
from jinja2 import Environment, FileSystemLoader

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Exceptions ───────────────────────────────────────────────────────────────


class AIServiceError(Exception):
    """Raised when the OpenAI API call fails after retries."""

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

_client: openai.AsyncOpenAI | None = None

_MODEL = "gpt-4o"


def _get_client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise AIServiceError("OPENAI_API_KEY is not configured")
        _client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


# ── Core call function ──────────────────────────────────────────────────────


async def call_openai(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int = 2000,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Call GPT-4o with JSON mode enforced and return parsed dict.

    Retries once with explicit JSON instruction on parse failure.
    Raises ``AIServiceError`` on any non-recoverable failure.
    """
    client = _get_client()

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=_MODEL,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
        except openai.RateLimitError as exc:
            logger.warning("OpenAI rate limited (429) — retries exhausted")
            raise AIServiceError(
                "AI service rate limited, please retry later", status_code=429
            ) from exc
        except openai.APIError as exc:
            logger.error("OpenAI API error: %s", exc)
            raise AIServiceError(
                f"AI service error: {exc}",
                status_code=getattr(exc, "status_code", None),
            ) from exc

        raw = response.choices[0].message.content

        # Log token usage
        usage = response.usage
        if usage:
            logger.info(
                "OpenAI usage — input: %d, output: %d tokens (model=%s)",
                usage.prompt_tokens,
                usage.completion_tokens,
                _MODEL,
            )

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            if attempt == 0:
                logger.warning(
                    "OpenAI returned non-JSON — retrying with stricter prompt"
                )
                messages.append({"role": "assistant", "content": raw})
                messages.append({
                    "role": "user",
                    "content": "Return ONLY valid JSON. No markdown, no preamble.",
                })
                continue
            logger.error(
                "Failed to parse OpenAI JSON after retry: %s", raw[:500]
            )
            raise AIServiceError(
                f"AI returned invalid JSON after retry: {raw[:200]}"
            )

    # Unreachable, but satisfies type checkers
    raise AIServiceError("AI call failed unexpectedly")


# ── Template + call helper ──────────────────────────────────────────────────


async def render_and_call(
    template_name: str,
    context: dict[str, Any],
    *,
    max_tokens: int = 2000,
    temperature: float = 0.2,
) -> dict[str, Any]:
    """Render a Jinja2 template with ---USER--- separator, then call OpenAI.

    Template format::

        Line 1-N: system prompt text
        ---USER---
        Line N+1+: user prompt with {{ variables }}
    """
    template = _jinja_env.get_template(template_name)
    rendered = template.render(**context)
    system, _, user = rendered.partition("\n---USER---\n")
    return await call_openai(
        system.strip(),
        user.strip(),
        max_tokens=max_tokens,
        temperature=temperature,
    )
