"""Shared application-wide enumerations.

Import from here to keep enum values consistent across models, schemas, and services.
"""

import enum


class UserRole(str, enum.Enum):
    platform_admin = "platform_admin"
    program_officer = "program_officer"
    reviewer = "reviewer"
    finance_officer = "finance_officer"
    applicant = "applicant"


class OrgType(str, enum.Enum):
    ngo = "ngo"
    trust = "trust"
    society = "society"
    company = "company"
    government = "government"
    individual = "individual"


class ApplicationStatus(str, enum.Enum):
    submitted = "submitted"
    screening = "screening"
    eligible = "eligible"
    ineligible = "ineligible"
    under_review = "under_review"
    review_complete = "review_complete"
    approved = "approved"
    rejected = "rejected"
    waitlisted = "waitlisted"
    agreement_sent = "agreement_sent"
    agreement_acknowledged = "agreement_acknowledged"
    active = "active"
    report_due = "report_due"
    closed = "closed"


class ScreeningOutcome(str, enum.Enum):
    eligible = "eligible"
    ineligible = "ineligible"
    needs_review = "needs_review"


class DisbursementTrigger(str, enum.Enum):
    submission_approval = "submission_approval"
    milestone_1 = "milestone_1"
    milestone_2 = "milestone_2"
    final = "final"


class DisbursementStatus(str, enum.Enum):
    pending = "pending"
    ready = "ready"
    disbursed = "disbursed"


class ReportType(str, enum.Enum):
    progress = "progress"
    final = "final"


class ReportStatus(str, enum.Enum):
    submitted = "submitted"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"


class ContentRating(str, enum.Enum):
    satisfactory = "satisfactory"
    needs_attention = "needs_attention"
    critical = "critical"
