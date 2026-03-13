"""Static programme definitions & eligibility rule registry.

These are the canonical programme specs used to:
  1. Seed the DB on first startup (via service.ensure_seeded).
  2. Power the server-side eligibility pre-check engine.
"""

from __future__ import annotations

from decimal import Decimal

# ── Districts classified as rural / semi-urban for CDG E3 ─────────────────────
RURAL_SEMI_URBAN_DISTRICTS: set[str] = {
    # Bihar
    "araria", "arwal", "aurangabad", "banka", "begusarai",
    "bhojpur", "buxar", "darbhanga", "east champaran", "gaya",
    "gopalganj", "jamui", "jehanabad", "kaimur", "katihar",
    "khagaria", "kishanganj", "lakhisarai", "madhepura",
    "madhubani", "munger", "muzaffarpur", "nalanda", "nawada",
    "rohtas", "saharsa", "samastipur", "saran", "sheikhpura",
    "sheohar", "sitamarhi", "siwan", "supaul", "vaishali",
    "west champaran",
    # Uttar Pradesh (rural)
    "bahraich", "ballia", "balrampur", "banda", "barabanki",
    "basti", "chitrakoot", "deoria", "etah", "etawah",
    "farrukhabad", "fatehpur", "firozabad", "gonda", "hardoi",
    "jaunpur", "jhansi", "kaushambi", "kheri", "kushinagar",
    "lalitpur", "mahoba", "maharajganj", "mainpuri", "mirzapur",
    "moradabad", "pilibhit", "pratapgarh", "raebareli", "shahjahanpur",
    "shravasti", "siddharthnagar", "sitapur", "sonbhadra",
    # Odisha
    "angul", "balangir", "balasore", "bargarh", "bhadrak",
    "boudh", "deogarh", "dhenkanal", "gajapati", "ganjam",
    "jagatsinghpur", "jajpur", "jharsuguda", "kalahandi",
    "kandhamal", "kendrapara", "kendujhar", "koraput",
    "malkangiri", "mayurbhanj", "nabarangpur", "nayagarh",
    "nuapada", "rayagada", "sambalpur", "sonepur", "subarnapur",
    # Rajasthan (rural/semi-urban)
    "ajmer", "alwar", "banswara", "baran", "barmer",
    "bharatpur", "bhilwara", "bikaner", "bundi", "chittorgarh",
    "churu", "dausa", "dholpur", "dungarpur", "hanumangarh",
    "jaisalmer", "jalore", "jhalawar", "jhunjhunu", "karauli",
    "nagaur", "pali", "pratapgarh", "rajsamand", "sawai madhopur",
    "sikar", "sirohi", "sri ganganagar", "tonk", "udaipur",
    # Jharkhand
    "bokaro", "chatra", "deoghar", "dhanbad", "dumka",
    "east singhbhum", "garhwa", "giridih", "godda", "gumla",
    "hazaribag", "jamtara", "khunti", "koderma", "latehar",
    "lohardaga", "pakur", "palamu", "ramgarh", "ranchi",
    "sahebganj", "seraikela kharsawan", "simdega", "west singhbhum",
    # Madhya Pradesh (rural)
    "agar malwa", "alirajpur", "anuppur", "ashoknagar", "balaghat",
    "barwani", "betul", "bhind", "chhatarpur", "chhindwara",
    "damoh", "datia", "dindori", "guna", "harda",
    "hoshangabad", "katni", "mandla", "mandsaur", "morena",
    "narsinghpur", "neemuch", "panna", "raisen", "rajgarh",
    "rewa", "sagar", "satna", "sehore", "seoni",
    "shahdol", "shajapur", "sheopur", "shivpuri", "sidhi",
    "singrauli", "tikamgarh", "umaria", "vidisha",
}

# ── Static programme seed data ────────────────────────────────────────────────

PROGRAMME_SEEDS: list[dict] = [
    {
        "code": "CDG",
        "name": "Community Development Grant",
        "purpose": (
            "Strengthens grassroots NGOs and community trusts working in rural and "
            "semi-urban districts to deliver basic services, livelihood programmes, "
            "and social-welfare initiatives."
        ),
        "funding_min_inr": Decimal("200000"),
        "funding_max_inr": Decimal("2000000"),
        "duration_min_months": 12,
        "duration_max_months": 24,
        "max_awards_per_cycle": 40,
        "total_budget_inr": Decimal("40000000"),
        "is_active": True,
        "metadata_json": {
            "application_window": {
                "opens": "2026-04-01",
                "closes": "2026-05-31",
            },
            "eligibility_criteria": [
                {
                    "rule_code": "CDG-E1",
                    "description": "Organisation type",
                    "requirement": "NGO, Trust, or Section 8 Company",
                },
                {
                    "rule_code": "CDG-E3",
                    "description": "Project location",
                    "requirement": "Rural or semi-urban district",
                },
                {
                    "rule_code": "CDG-E4",
                    "description": "Grant amount",
                    "requirement": "₹2,00,000 – ₹20,00,000",
                },
                {
                    "rule_code": "CDG-E6",
                    "description": "Overhead ratio",
                    "requirement": "≤ 15 % of total budget",
                },
            ],
            "scoring_rubric": [
                {"dimension": "Community Impact", "weight_pct": 35},
                {"dimension": "Organisational Capacity", "weight_pct": 25},
                {"dimension": "Financial Health", "weight_pct": 20},
                {"dimension": "Implementation Plan", "weight_pct": 20},
            ],
            "disbursement_schedule": [
                {"milestone": "Grant agreement signed", "pct": 40},
                {"milestone": "Mid-term report approved", "pct": 40},
                {"milestone": "Final report accepted", "pct": 20},
            ],
        },
    },
    {
        "code": "EIG",
        "name": "Education Innovation Grant",
        "purpose": (
            "Catalyses technology-enabled learning interventions in under-resourced "
            "schools, supporting EdTech startups, universities, and research bodies "
            "to pilot and scale evidence-based pedagogy tools."
        ),
        "funding_min_inr": Decimal("500000"),
        "funding_max_inr": Decimal("5000000"),
        "duration_min_months": 18,
        "duration_max_months": 36,
        "max_awards_per_cycle": 20,
        "total_budget_inr": Decimal("50000000"),
        "is_active": True,
        "metadata_json": {
            "application_window": {
                "opens": "2026-05-01",
                "closes": "2026-06-30",
            },
            "eligibility_criteria": [
                {
                    "rule_code": "EIG-E1",
                    "description": "Organisation type",
                    "requirement": "NGO, EdTech Company, Research Institute, or University",
                },
                {
                    "rule_code": "EIG-E3",
                    "description": "Grant amount",
                    "requirement": "₹5,00,000 – ₹50,00,000",
                },
                {
                    "rule_code": "EIG-E5",
                    "description": "School reach",
                    "requirement": "Minimum 5 government or government-aided schools",
                },
            ],
            "scoring_rubric": [
                {"dimension": "Learning Outcome Evidence", "weight_pct": 40},
                {"dimension": "Technology Readiness", "weight_pct": 25},
                {"dimension": "Scalability Plan", "weight_pct": 20},
                {"dimension": "Partnerships", "weight_pct": 15},
            ],
            "disbursement_schedule": [
                {"milestone": "Pilot launch confirmed", "pct": 35},
                {"milestone": "Midline assessment submitted", "pct": 35},
                {"milestone": "Endline report accepted", "pct": 30},
            ],
        },
    },
    {
        "code": "ECAG",
        "name": "Ecological Conservation & Agri Grant",
        "purpose": (
            "Supports nature-positive agricultural transitions and conservation "
            "projects led by farmer-producer organisations, Panchayats, and research "
            "groups working on biodiversity, soil restoration, and climate resilience."
        ),
        "funding_min_inr": Decimal("300000"),
        "funding_max_inr": Decimal("3000000"),
        "duration_min_months": 12,
        "duration_max_months": 30,
        "max_awards_per_cycle": 30,
        "total_budget_inr": Decimal("45000000"),
        "is_active": True,
        "metadata_json": {
            "application_window": {
                "opens": "2026-04-15",
                "closes": "2026-06-15",
            },
            "eligibility_criteria": [
                {
                    "rule_code": "ECAG-E1",
                    "description": "Organisation type",
                    "requirement": "NGO, FPO, Panchayat, or Research Institute",
                },
                {
                    "rule_code": "ECAG-E2",
                    "description": "Grant amount",
                    "requirement": "₹3,00,000 – ₹30,00,000",
                },
            ],
            "scoring_rubric": [
                {"dimension": "Ecological Impact", "weight_pct": 40},
                {"dimension": "Farmer Benefit", "weight_pct": 30},
                {"dimension": "Technical Approach", "weight_pct": 20},
                {"dimension": "Monitoring Plan", "weight_pct": 10},
            ],
            "disbursement_schedule": [
                {"milestone": "Project commencement", "pct": 50},
                {"milestone": "Seasonal review passed", "pct": 30},
                {"milestone": "Completion report accepted", "pct": 20},
            ],
        },
    },
]


# ── Eligibility rule registry ─────────────────────────────────────────────────
# Each entry is a callable (req_dict) -> FailedRule | None.
# req_dict keys: org_type (str), project_district (str), funding_amount_inr (Decimal)

CDG_ELIGIBLE_ORG_TYPES = {"ngo", "trust", "section8", "section 8"}
EIG_ELIGIBLE_ORG_TYPES = {"ngo", "edtech", "research", "university", "research institute"}
ECAG_ELIGIBLE_ORG_TYPES = {"ngo", "fpo", "panchayat", "research", "research institute"}


def _check_cdg(org_type: str, district: str, amount: Decimal) -> list[dict]:
    failures = []

    if org_type.lower() not in CDG_ELIGIBLE_ORG_TYPES:
        failures.append({
            "rule_code": "CDG-E1",
            "reason": f"Organisation type '{org_type}' is not eligible; must be NGO, Trust, or Section 8 Company.",
        })

    if district.lower() not in RURAL_SEMI_URBAN_DISTRICTS:
        failures.append({
            "rule_code": "CDG-E3",
            "reason": f"District '{district}' is not classified as rural or semi-urban.",
        })

    if not (Decimal("200000") <= amount <= Decimal("2000000")):
        failures.append({
            "rule_code": "CDG-E4",
            "reason": (
                f"Requested amount ₹{amount:,.0f} is outside the eligible range "
                "of ₹2,00,000 – ₹20,00,000."
            ),
        })

    return failures


def _check_eig(org_type: str, district: str, amount: Decimal) -> list[dict]:  # noqa: ARG001
    failures = []

    if org_type.lower() not in EIG_ELIGIBLE_ORG_TYPES:
        failures.append({
            "rule_code": "EIG-E1",
            "reason": (
                f"Organisation type '{org_type}' is not eligible; must be NGO, "
                "EdTech, Research Institute, or University."
            ),
        })

    if not (Decimal("500000") <= amount <= Decimal("5000000")):
        failures.append({
            "rule_code": "EIG-E3",
            "reason": (
                f"Requested amount ₹{amount:,.0f} is outside the eligible range "
                "of ₹5,00,000 – ₹50,00,000."
            ),
        })

    # EIG-E5 (schools≥5) requires a separate field not in precheck form → skipped

    return failures


def _check_ecag(org_type: str, district: str, amount: Decimal) -> list[dict]:  # noqa: ARG001
    failures = []

    if org_type.lower() not in ECAG_ELIGIBLE_ORG_TYPES:
        failures.append({
            "rule_code": "ECAG-E1",
            "reason": (
                f"Organisation type '{org_type}' is not eligible; must be NGO, "
                "FPO, Panchayat, or Research Institute."
            ),
        })

    if not (Decimal("300000") <= amount <= Decimal("3000000")):
        failures.append({
            "rule_code": "ECAG-E2",
            "reason": (
                f"Requested amount ₹{amount:,.0f} is outside the eligible range "
                "of ₹3,00,000 – ₹30,00,000."
            ),
        })

    return failures


RULE_CHECKERS: dict[str, callable] = {
    "CDG": _check_cdg,
    "EIG": _check_eig,
    "ECAG": _check_ecag,
}
