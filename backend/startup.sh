#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding the database with programmes..."
python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.features.programmes.service import ensure_seeded

async def seed():
    async with AsyncSessionLocal() as db:
        await ensure_seeded(db)

asyncio.run(seed())
"

echo "Starting Uvicorn server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
