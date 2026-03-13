"""Async Redis client — shared across OTP storage, token blacklist, and caching."""

from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    """Create the module-level Redis connection pool. Call once at startup."""
    global redis_client
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
    )
    await redis_client.ping()
    return redis_client


async def close_redis() -> None:
    """Gracefully shut down the pool. Call at app shutdown."""
    global redis_client
    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


def get_redis() -> aioredis.Redis:
    """Return the live client. Raises if init_redis() hasn't been called."""
    if redis_client is None:
        raise RuntimeError("Redis not initialised — call init_redis() first")
    return redis_client
