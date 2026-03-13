import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.core.config import settings
from app.core.database import Base

# ── Import all feature models so Alembic detects every table ─────────────────
from app.features.auth.models import User, Organisation  # noqa: F401
from app.features.programmes.models import GrantProgramme  # noqa: F401
from app.features.applications.models import Application, Document  # noqa: F401
from app.features.screening.models import ScreeningReport  # noqa: F401
from app.features.review.models import ApplicationAnnotation, ReviewAssignment, ReviewPackage, ReviewScore  # noqa: F401
from app.features.finance.models import Disbursement  # noqa: F401
from app.features.compliance.models import Report, ComplianceAnalysis  # noqa: F401
from app.features.messaging.models import Message  # noqa: F401
from app.features.admin.models import AuditLog, LetterTemplate  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without a live DB connection."""
    url = settings.DATABASE_URL.replace("+asyncpg", "")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    cfg = config.get_section(config.config_ini_section) or {}
    cfg["sqlalchemy.url"] = settings.DATABASE_URL
    connectable = async_engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
