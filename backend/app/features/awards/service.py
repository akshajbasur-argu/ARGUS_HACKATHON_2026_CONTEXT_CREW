"""Awards service — decision recording, letter generation, agreement management."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import (
    AgreementStatus,
    ApplicationStatus,
    AwardDecision,
    DisbursementStatus,
    LetterStatus,
)
from app.features.applications.models import Application
from app.features.auth.models import Organisation, User
from app.features.awards.models import Agreement, AwardLetter, AwardRecord
from app.features.finance.models import Disbursement
from app.features.programmes.models import GrantProgramme


# ── Template merge engine ────────────────────────────────────────────────────


def merge_template(template_text: str, context: dict) -> str:
    """Replace {{field_name}} placeholders with values from context dict."""

    def _replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        value = context.get(key, "")
        if value is None:
            return ""
        return str(value)

    return re.sub(r"\{\{(.+?)\}\}", _replacer, template_text)


def _format_inr(amount: Decimal | float | int | None) -> str:
    """Format a number as Indian Rupees."""
    if amount is None:
        return "N/A"
    num = float(amount)
    # Use Indian locale formatting: lakh/crore grouping
    s = f"{num:,.2f}"
    # Convert 1,500,000.00 → 15,00,000.00
    parts = s.split(".")
    integer_part = parts[0].replace(",", "")
    if len(integer_part) <= 3:
        formatted = integer_part
    else:
        last_three = integer_part[-3:]
        remaining = integer_part[:-3]
        groups = []
        while remaining:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        formatted = ",".join(groups) + "," + last_three
    return f"INR {formatted}.{parts[1]}"


def _build_context_from_application(
    app: Application, programme: GrantProgramme, org: Organisation, award: AwardRecord | None = None
) -> dict:
    """Build a merge context dictionary from application, programme, org, and award data."""
    form = app.form_data or {}
    now = datetime.now(timezone.utc)

    ctx = {
        "award_date": now.strftime("%d %B %Y"),
        "decision_date": now.strftime("%d %B %Y"),
        "grant_reference": app.reference_number,
        "grantee_organisation_name": org.legal_name,
        "programme_name": programme.name,
        "programme_code": programme.code,
        "project_title": form.get("project_title", "Untitled Project"),
        "project_summary": form.get("project_summary", ""),
        "start_date": form.get("start_date", "TBD"),
        "end_date": form.get("end_date", "TBD"),
        "duration_months": form.get("duration_months", ""),
        "contact_person": org.contact_person or "",
        "organisation_type": org.org_type.value if org.org_type else "",
        "state": org.state or "",
        "registration_number": org.registration_number or "",
        "applicant_name": form.get("applicant_name", ""),
        "applicant_email": form.get("applicant_email", ""),
    }

    if award:
        ctx["award_amount"] = _format_inr(award.award_amount)
        ctx["award_amount_words"] = form.get("award_amount_words", "")
        ctx["special_conditions"] = award.special_conditions or "None"
        ctx["rejection_reasons"] = award.reason
        ctx["decision_reasons"] = award.reason

    return ctx


# ── Letter templates ─────────────────────────────────────────────────────────

AWARD_LETTER_TEMPLATE = """
<div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #3B2F1E;">
  <div style="border-bottom: 3px solid #4A6741; padding-bottom: 20px; margin-bottom: 30px;">
    <h1 style="font-family: 'Playfair Display', serif; color: #4A6741; margin: 0;">GrantFlow</h1>
    <p style="color: #8B5E3C; margin: 5px 0 0;">Award Notification Letter</p>
  </div>

  <p><strong>Date:</strong> {{award_date}}</p>
  <p><strong>Reference:</strong> {{grant_reference}}</p>

  <p>Dear {{contact_person}},</p>

  <p>We are pleased to inform you that your application under the <strong>{{programme_name}}</strong>
  programme has been <strong style="color: #4A6741;">approved</strong> for funding.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Organisation</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{grantee_organisation_name}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Project Title</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{project_title}}</td>
    </tr>
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Award Amount</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>{{award_amount}}</strong></td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Project Duration</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{start_date}} to {{end_date}}</td>
    </tr>
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Special Conditions</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{special_conditions}}</td>
    </tr>
  </table>

  <p><strong>Decision Rationale:</strong> {{decision_reasons}}</p>

  <p>A formal Grant Agreement will follow this letter. Please review and acknowledge the
  agreement to initiate the disbursement process.</p>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #C4A882;">
    <p>Warm regards,<br><strong>Programme Management Team</strong><br>GrantFlow Platform</p>
  </div>
</div>
"""

REJECTION_LETTER_TEMPLATE = """
<div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #3B2F1E;">
  <div style="border-bottom: 3px solid #8B3A2A; padding-bottom: 20px; margin-bottom: 30px;">
    <h1 style="font-family: 'Playfair Display', serif; color: #8B3A2A; margin: 0;">GrantFlow</h1>
    <p style="color: #8B5E3C; margin: 5px 0 0;">Application Decision Letter</p>
  </div>

  <p><strong>Date:</strong> {{decision_date}}</p>
  <p><strong>Reference:</strong> {{grant_reference}}</p>

  <p>Dear {{contact_person}},</p>

  <p>Thank you for your application under the <strong>{{programme_name}}</strong> programme
  for the project titled <strong>{{project_title}}</strong>.</p>

  <p>After careful review, we regret to inform you that your application has
  <strong style="color: #8B3A2A;">not been selected</strong> for funding in this cycle.</p>

  <div style="background: #FAF6EE; border-left: 4px solid #8B3A2A; padding: 15px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Reason:</strong></p>
    <p style="margin: 5px 0 0;">{{rejection_reasons}}</p>
  </div>

  <p>We encourage you to review the feedback and consider applying in future funding cycles.
  For questions, please reach out through the messaging system on the GrantFlow platform.</p>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #C4A882;">
    <p>With best wishes,<br><strong>Programme Management Team</strong><br>GrantFlow Platform</p>
  </div>
</div>
"""

AGREEMENT_TEMPLATE = """
<div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #3B2F1E;">
  <div style="border-bottom: 3px solid #D4A843; padding-bottom: 20px; margin-bottom: 30px;">
    <h1 style="font-family: 'Playfair Display', serif; color: #3B2F1E; margin: 0;">Grant Agreement</h1>
    <p style="color: #8B5E3C; margin: 5px 0 0;">GrantFlow Platform</p>
  </div>

  <h2 style="color: #4A6741;">1. Parties</h2>
  <p>This Grant Agreement ("Agreement") is entered into between <strong>GrantFlow</strong>
  (the "Grantor") and <strong>{{grantee_organisation_name}}</strong> (the "Grantee"),
  Registration No. {{registration_number}}, located in {{state}}.</p>

  <h2 style="color: #4A6741;">2. Grant Details</h2>
  <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Reference</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{grant_reference}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Programme</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{programme_name}} ({{programme_code}})</td>
    </tr>
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Project Title</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{project_title}}</td>
    </tr>
    <tr>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Grant Amount</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>{{award_amount}}</strong></td>
    </tr>
    <tr style="background: #F5EDD8;">
      <td style="padding: 10px; border: 1px solid #C4A882;"><strong>Duration</strong></td>
      <td style="padding: 10px; border: 1px solid #C4A882;">{{start_date}} to {{end_date}}</td>
    </tr>
  </table>

  <h2 style="color: #4A6741;">3. Disbursement Schedule</h2>
  {{tranche_table}}

  <h2 style="color: #4A6741;">4. Special Conditions</h2>
  <div style="background: #FAF6EE; border-left: 4px solid #D4A843; padding: 15px; margin: 15px 0;">
    {{special_conditions}}
  </div>

  <h2 style="color: #4A6741;">5. Obligations</h2>
  <ul>
    <li>Submit progress reports as per the agreed schedule.</li>
    <li>Use grant funds only for the stated project purposes.</li>
    <li>Maintain accurate financial records and provide them upon request.</li>
    <li>Acknowledge GrantFlow in publications or public communications related to this project.</li>
  </ul>

  <h2 style="color: #4A6741;">6. Acknowledgement</h2>
  <p>By acknowledging this agreement, the Grantee confirms acceptance of all terms and
  conditions outlined herein and agrees to comply with the reporting and financial
  requirements of the grant.</p>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #D4A843;">
    <p><strong>GrantFlow Programme Management</strong><br>Date: {{award_date}}</p>
  </div>
</div>
"""


# ── Query helpers ────────────────────────────────────────────────────────────


async def get_application_with_context(
    db: AsyncSession, app_id: uuid.UUID
) -> tuple[Application, GrantProgramme, User, Organisation]:
    """Load application with programme, applicant user, and organisation."""
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    application = result.scalar_one_or_none()
    if application is None:
        raise ValueError("Application not found")

    prog_result = await db.execute(
        select(GrantProgramme).where(GrantProgramme.id == application.programme_id)
    )
    programme = prog_result.scalar_one()

    user_result = await db.execute(
        select(User)
        .options(selectinload(User.organisation))
        .where(User.id == application.applicant_id)
    )
    user = user_result.scalar_one()
    org = user.organisation
    if org is None:
        raise ValueError("Applicant organisation not found")

    return application, programme, user, org


async def get_award_record(db: AsyncSession, app_id: uuid.UUID) -> AwardRecord | None:
    result = await db.execute(
        select(AwardRecord).where(AwardRecord.application_id == app_id)
    )
    return result.scalar_one_or_none()


async def get_award_with_letter(db: AsyncSession, app_id: uuid.UUID) -> AwardRecord | None:
    result = await db.execute(
        select(AwardRecord)
        .options(selectinload(AwardRecord.letter))
        .where(AwardRecord.application_id == app_id)
    )
    return result.scalar_one_or_none()


async def get_award_with_agreement(db: AsyncSession, app_id: uuid.UUID) -> AwardRecord | None:
    result = await db.execute(
        select(AwardRecord)
        .options(selectinload(AwardRecord.agreement))
        .where(AwardRecord.application_id == app_id)
    )
    return result.scalar_one_or_none()


# ── Decision ─────────────────────────────────────────────────────────────────


async def record_decision(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    officer_id: uuid.UUID,
    decision: AwardDecision,
    reason: str,
) -> tuple[AwardRecord, AwardLetter]:
    """Record a decision and generate the appropriate letter draft."""
    application, programme, user, org = await get_application_with_context(db, app_id)

    # Validate current status
    valid_statuses = {ApplicationStatus.review_complete, ApplicationStatus.eligible}
    if application.status not in valid_statuses:
        raise ValueError(
            f"Application must be in {[s.value for s in valid_statuses]} status, "
            f"got {application.status.value}"
        )

    # Check no existing award record
    existing = await get_award_record(db, app_id)
    if existing is not None:
        raise ValueError("Decision already recorded for this application")

    # Determine award amount from form_data for approved applications
    award_amount = None
    if decision == AwardDecision.approved:
        raw = application.form_data.get("requested_amount") or application.form_data.get("budget_total")
        if raw is not None:
            award_amount = Decimal(str(raw))

    award = AwardRecord(
        application_id=app_id,
        decided_by=officer_id,
        decision=decision,
        reason=reason,
        award_amount=award_amount,
    )
    db.add(award)
    await db.flush()

    # Generate letter
    ctx = _build_context_from_application(application, programme, org, award)

    if decision == AwardDecision.approved:
        html = merge_template(AWARD_LETTER_TEMPLATE, ctx)
        letter_type = "award"
    else:
        html = merge_template(REJECTION_LETTER_TEMPLATE, ctx)
        letter_type = "rejection"

    letter = AwardLetter(
        award_record_id=award.id,
        letter_type=letter_type,
        html_content=html,
    )
    db.add(letter)

    # Update application status
    status_map = {
        AwardDecision.approved: ApplicationStatus.approved,
        AwardDecision.rejected: ApplicationStatus.rejected,
        AwardDecision.waitlisted: ApplicationStatus.waitlisted,
    }
    application.status = status_map[decision]
    await db.flush()

    return award, letter


# ── Letter preview & send ────────────────────────────────────────────────────


async def get_letter_preview(db: AsyncSession, app_id: uuid.UUID) -> AwardLetter:
    award = await get_award_with_letter(db, app_id)
    if award is None or award.letter is None:
        raise ValueError("No letter found for this application")
    return award.letter


async def send_letter(db: AsyncSession, app_id: uuid.UUID) -> AwardLetter:
    award = await get_award_with_letter(db, app_id)
    if award is None or award.letter is None:
        raise ValueError("No letter found for this application")

    if award.letter.status == LetterStatus.sent:
        raise ValueError("Letter has already been sent")

    award.letter.status = LetterStatus.sent
    award.letter.sent_at = datetime.now(timezone.utc)
    await db.flush()
    return award.letter


# ── Agreement generation & send ──────────────────────────────────────────────


def _build_tranche_table(tranches: list[dict]) -> str:
    """Build an HTML table for the disbursement schedule."""
    if not tranches:
        return "<p><em>No tranches defined yet.</em></p>"

    rows = ""
    total = Decimal("0")
    for i, t in enumerate(tranches):
        bg = ' style="background: #F5EDD8;"' if i % 2 == 0 else ""
        amt = Decimal(str(t["amount_inr"]))
        total += amt
        rows += (
            f'<tr{bg}>'
            f'<td style="padding: 10px; border: 1px solid #C4A882;">{t["label"]}</td>'
            f'<td style="padding: 10px; border: 1px solid #C4A882;">{_format_inr(amt)}</td>'
            f'<td style="padding: 10px; border: 1px solid #C4A882;">{t["trigger_type"]}</td>'
            f'<td style="padding: 10px; border: 1px solid #C4A882;">{t.get("notes", "") or ""}</td>'
            f"</tr>"
        )

    return (
        '<table style="width: 100%; border-collapse: collapse; margin: 15px 0;">'
        '<tr style="background: #3B2F1E; color: #FAF6EE;">'
        '<th style="padding: 10px; border: 1px solid #C4A882; text-align: left;">Tranche</th>'
        '<th style="padding: 10px; border: 1px solid #C4A882; text-align: left;">Amount</th>'
        '<th style="padding: 10px; border: 1px solid #C4A882; text-align: left;">Trigger</th>'
        '<th style="padding: 10px; border: 1px solid #C4A882; text-align: left;">Notes</th>'
        f"</tr>{rows}"
        f'<tr style="background: #4A6741; color: #FAF6EE;">'
        f'<td style="padding: 10px; border: 1px solid #C4A882;"><strong>Total</strong></td>'
        f'<td style="padding: 10px; border: 1px solid #C4A882;"><strong>{_format_inr(total)}</strong></td>'
        f'<td colspan="2" style="padding: 10px; border: 1px solid #C4A882;"></td>'
        f"</tr></table>"
    )


async def generate_agreement(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    special_conditions: str | None = None,
) -> Agreement:
    """Generate a Grant Agreement from template 3 with merge fields."""
    award = await get_award_with_agreement(db, app_id)
    if award is None:
        raise ValueError("No award record found")
    if award.decision != AwardDecision.approved:
        raise ValueError("Agreement can only be generated for approved applications")

    application, programme, user, org = await get_application_with_context(db, app_id)

    # Update special conditions on award if provided
    if special_conditions is not None:
        award.special_conditions = special_conditions

    # Get existing tranches for this application
    from sqlalchemy import select as sa_select

    tranche_result = await db.execute(
        sa_select(Disbursement).where(Disbursement.application_id == app_id)
    )
    tranches = tranche_result.scalars().all()
    tranche_dicts = [
        {
            "label": t.tranche_label,
            "amount_inr": t.amount_inr,
            "trigger_type": t.trigger_type.value,
            "notes": "",
        }
        for t in tranches
    ]

    ctx = _build_context_from_application(application, programme, org, award)
    ctx["tranche_table"] = _build_tranche_table(tranche_dicts)
    ctx["special_conditions"] = special_conditions or award.special_conditions or "No special conditions."

    html = merge_template(AGREEMENT_TEMPLATE, ctx)

    # Create or update agreement
    if award.agreement is not None:
        award.agreement.html_content = html
        award.agreement.special_conditions = special_conditions
        award.agreement.tranche_summary = {"tranches": tranche_dicts}
        agreement = award.agreement
    else:
        agreement = Agreement(
            award_record_id=award.id,
            html_content=html,
            special_conditions=special_conditions,
            tranche_summary={"tranches": tranche_dicts},
        )
        db.add(agreement)

    await db.flush()
    return agreement


async def send_agreement(db: AsyncSession, app_id: uuid.UUID) -> Agreement:
    """Mark agreement as sent, update application status."""
    award = await get_award_with_agreement(db, app_id)
    if award is None or award.agreement is None:
        raise ValueError("No agreement found for this application")

    if award.agreement.status != AgreementStatus.draft:
        raise ValueError(f"Agreement is already {award.agreement.status.value}")

    award.agreement.status = AgreementStatus.sent
    award.agreement.sent_at = datetime.now(timezone.utc)

    # Update application status
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    application = result.scalar_one()
    application.status = ApplicationStatus.agreement_sent

    await db.flush()
    return award.agreement


async def acknowledge_agreement(db: AsyncSession, app_id: uuid.UUID) -> Agreement:
    """Grantee acknowledges the agreement — triggers inception tranche readiness."""
    award = await get_award_with_agreement(db, app_id)
    if award is None or award.agreement is None:
        raise ValueError("No agreement found for this application")

    if award.agreement.status != AgreementStatus.sent:
        raise ValueError("Agreement must be in 'sent' status to acknowledge")

    award.agreement.status = AgreementStatus.acknowledged
    award.agreement.acknowledged_at = datetime.now(timezone.utc)

    # Update application status
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    application = result.scalar_one()
    application.status = ApplicationStatus.agreement_acknowledged

    # Mark inception tranches as ready
    tranche_result = await db.execute(
        select(Disbursement).where(
            Disbursement.application_id == app_id,
            Disbursement.trigger_type == "inception",
        )
    )
    for tranche in tranche_result.scalars().all():
        tranche.status = DisbursementStatus.ready

    await db.flush()
    return award.agreement


# ── Tranches ─────────────────────────────────────────────────────────────────


async def create_tranches(
    db: AsyncSession,
    *,
    app_id: uuid.UUID,
    tranches: list[dict],
) -> list[Disbursement]:
    """Create disbursement tranches for an application."""
    # Delete existing tranches (replace strategy)
    existing_result = await db.execute(
        select(Disbursement).where(Disbursement.application_id == app_id)
    )
    for existing in existing_result.scalars().all():
        await db.delete(existing)
    await db.flush()

    created = []
    for t in tranches:
        d = Disbursement(
            application_id=app_id,
            tranche_label=t["label"],
            amount_inr=Decimal(str(t["amount_inr"])),
            trigger_type=t["trigger_type"],
            status=DisbursementStatus.pending,
        )
        db.add(d)
        created.append(d)

    await db.flush()
    return created


async def get_tranches(db: AsyncSession, app_id: uuid.UUID) -> list[Disbursement]:
    result = await db.execute(
        select(Disbursement).where(Disbursement.application_id == app_id)
    )
    return list(result.scalars().all())
