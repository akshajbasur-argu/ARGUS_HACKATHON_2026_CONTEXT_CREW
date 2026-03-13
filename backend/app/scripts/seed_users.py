"""Seed test users for each role.

Run with:
    cd backend
    python -m app.scripts.seed_users
"""

import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.features.auth.models import User, Organisation
from app.core.enums import UserRole, OrgType

TEST_USERS = [
    {
        "email": "admin@grantflow.org",
        "full_name": "Platform Admin",
        "role": UserRole.platform_admin,
        "password": "Password123",
    },
    {
        "email": "officer@grantflow.org",
        "full_name": "Program Officer",
        "role": UserRole.program_officer,
        "password": "Password123",
    },
    {
        "email": "reviewer@grantflow.org",
        "full_name": "Grant Reviewer",
        "role": UserRole.reviewer,
        "password": "Password123",
    },
    {
        "email": "finance@grantflow.org",
        "full_name": "Finance Officer",
        "role": UserRole.finance_officer,
        "password": "Password123",
    },
    {
        "email": "applicant@grantflow.org",
        "full_name": "Sample Applicant",
        "role": UserRole.applicant,
        "password": "Password123",
        "is_org": True,
    },
]

async def run_seed() -> None:
    async with AsyncSessionLocal() as session:
        for user_data in TEST_USERS:
            existing = await session.scalar(
                select(User).where(User.email == user_data["email"])
            )
            if existing:
                print(f"  [SKIP] {user_data['email']} already exists.")
                continue

            user = User(
                email=user_data["email"],
                hashed_password=hash_password(user_data["password"]),
                full_name=user_data["full_name"],
                role=user_data["role"],
                is_active=True,
            )
            session.add(user)
            await session.flush()

            if user_data.get("is_org"):
                org = Organisation(
                    user_id=user.id,
                    legal_name=f"{user_data['full_name']} Org",
                    org_type=OrgType.ngo,
                    registration_number=f"REG-{uuid.uuid4().hex[:8].upper()}",
                )
                session.add(org)
            
            print(f"  [ADD]  {user_data['email']} ({user_data['role'].value})")

        await session.commit()
    print("User seeding complete.")

if __name__ == "__main__":
    print("Seeding test users…")
    asyncio.run(run_seed())
