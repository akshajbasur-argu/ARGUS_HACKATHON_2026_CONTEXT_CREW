"""Seed CDG, EIG, and ECAG grant programmes.

Run with:
    cd backend
    python -m app.scripts.seed
"""

import asyncio
import uuid
from decimal import Decimal

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.features.programmes.models import GrantProgramme

PROGRAMMES = [
    {
        "id": uuid.uuid4(),
        "code": "CDG",
        "name": "Community Development Grant",
        "purpose": (
            "Support grassroots organisations to design and deliver community-led "
            "development initiatives that strengthen social cohesion and improve "
            "livelihoods in underserved areas."
        ),
        "funding_min_inr": Decimal("500000"),
        "funding_max_inr": Decimal("2500000"),
        "duration_min_months": 12,
        "duration_max_months": 24,
        "max_awards_per_cycle": 20,
        "total_budget_inr": Decimal("30000000"),
        "is_active": True,
        "metadata_json": {
            "eligibility_rules": {
                "min_years_registered": 2,
                "min_annual_budget_inr": 200000,
                "required_org_types": ["ngo", "trust", "society"],
                "excluded_states": [],
                "required_documents": [
                    "registration_certificate",
                    "audited_accounts_2years",
                    "board_resolution",
                    "project_proposal",
                ],
            },
            "scoring_rubric": {
                "dimensions": [
                    {"key": "need_relevance",       "label": "Need & Relevance",       "max_score": 25},
                    {"key": "implementation_plan",  "label": "Implementation Plan",    "max_score": 25},
                    {"key": "org_capacity",         "label": "Organisational Capacity","max_score": 20},
                    {"key": "sustainability",       "label": "Sustainability",          "max_score": 15},
                    {"key": "budget_justification", "label": "Budget Justification",   "max_score": 15},
                ],
                "pass_threshold": 60,
            },
            "disbursement_schedule": [
                {"tranche": "First instalment",  "percent": 40, "trigger": "submission_approval"},
                {"tranche": "Mid-term instalment","percent": 40, "trigger": "milestone_1"},
                {"tranche": "Final instalment",  "percent": 20, "trigger": "final"},
            ],
        },
    },
    {
        "id": uuid.uuid4(),
        "code": "EIG",
        "name": "Equity & Inclusion Grant",
        "purpose": (
            "Fund initiatives that promote gender equity, disability inclusion, "
            "and social justice for historically marginalised communities."
        ),
        "funding_min_inr": Decimal("300000"),
        "funding_max_inr": Decimal("1500000"),
        "duration_min_months": 6,
        "duration_max_months": 18,
        "max_awards_per_cycle": 30,
        "total_budget_inr": Decimal("25000000"),
        "is_active": True,
        "metadata_json": {
            "eligibility_rules": {
                "min_years_registered": 1,
                "min_annual_budget_inr": 100000,
                "required_org_types": ["ngo", "trust", "society", "individual"],
                "focus_areas": ["gender", "disability", "tribal", "minority"],
                "required_documents": [
                    "registration_certificate",
                    "audited_accounts_1year",
                    "project_proposal",
                    "equity_statement",
                ],
            },
            "scoring_rubric": {
                "dimensions": [
                    {"key": "equity_focus",         "label": "Equity Focus",            "max_score": 30},
                    {"key": "reach_impact",         "label": "Reach & Impact",          "max_score": 25},
                    {"key": "community_voice",      "label": "Community Voice",         "max_score": 20},
                    {"key": "org_capacity",         "label": "Organisational Capacity", "max_score": 15},
                    {"key": "budget_justification", "label": "Budget Justification",    "max_score": 10},
                ],
                "pass_threshold": 55,
            },
            "disbursement_schedule": [
                {"tranche": "First instalment", "percent": 50, "trigger": "submission_approval"},
                {"tranche": "Final instalment", "percent": 50, "trigger": "final"},
            ],
        },
    },
    {
        "id": uuid.uuid4(),
        "code": "ECAG",
        "name": "Early Childhood Action Grant",
        "purpose": (
            "Strengthen early childhood care and education (ECCE) services for "
            "children aged 0-6 in low-income communities, with a focus on nutrition, "
            "cognitive development, and school readiness."
        ),
        "funding_min_inr": Decimal("400000"),
        "funding_max_inr": Decimal("2000000"),
        "duration_min_months": 12,
        "duration_max_months": 36,
        "max_awards_per_cycle": 15,
        "total_budget_inr": Decimal("20000000"),
        "is_active": True,
        "metadata_json": {
            "eligibility_rules": {
                "min_years_registered": 3,
                "min_annual_budget_inr": 300000,
                "required_org_types": ["ngo", "trust", "society", "government"],
                "target_age_group": "0-6",
                "required_documents": [
                    "registration_certificate",
                    "audited_accounts_2years",
                    "board_resolution",
                    "project_proposal",
                    "ecce_framework_alignment",
                    "safeguarding_policy",
                ],
            },
            "scoring_rubric": {
                "dimensions": [
                    {"key": "child_development_approach", "label": "Child Development Approach", "max_score": 30},
                    {"key": "reach_vulnerability",        "label": "Reach & Vulnerability",      "max_score": 25},
                    {"key": "implementation_plan",        "label": "Implementation Plan",        "max_score": 20},
                    {"key": "org_capacity",               "label": "Organisational Capacity",    "max_score": 15},
                    {"key": "budget_justification",       "label": "Budget Justification",       "max_score": 10},
                ],
                "pass_threshold": 65,
            },
            "disbursement_schedule": [
                {"tranche": "First instalment",      "percent": 30, "trigger": "submission_approval"},
                {"tranche": "Mid-term instalment 1", "percent": 30, "trigger": "milestone_1"},
                {"tranche": "Mid-term instalment 2", "percent": 25, "trigger": "milestone_2"},
                {"tranche": "Final instalment",      "percent": 15, "trigger": "final"},
            ],
            "climate_vulnerable_districts": [
                "Kutch", "Saurashtra", "Sundarbans", "Chilika", "Puri",
                "Konkan Coast", "Lakshadweep", "Andaman", "Brahmaputra Valley",
                "Vidarbha", "Marathwada", "Bundelkhand", "Rayalaseema",
                "North Bihar Plains", "Assam Flood Plains", "Uttarakhand Hills",
                "Himachal Pradesh Hills", "Thar Desert", "Chambal Valley", "Coromandel Coast",
            ],
        },
    },
]


async def run_seed() -> None:
    async with AsyncSessionLocal() as session:
        for prog_data in PROGRAMMES:
            existing = await session.scalar(
                select(GrantProgramme).where(GrantProgramme.code == prog_data["code"])
            )
            if existing:
                print(f"  [SKIP] {prog_data['code']} already exists.")
                continue
            session.add(GrantProgramme(**prog_data))
            print(f"  [ADD]  {prog_data['code']} — {prog_data['name']}")

        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    print("Seeding grant programmes…")
    asyncio.run(run_seed())
