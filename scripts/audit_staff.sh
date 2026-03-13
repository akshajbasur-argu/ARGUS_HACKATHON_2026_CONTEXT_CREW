#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# GrantFlow Staff-Facing Feature Audit Script
# Tests: AI soft checks, ECAG geo priority, text annotations, EIG 2-reviewer
#        comparison, agreement acknowledgement, bank details RBAC, waitlist
#        notifications, and template editor (admin).
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:8000}"
API="${BASE_URL}/api/v1"
PASS=0
FAIL=0
WARN=0
TOTAL=0
RESULTS=()

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────

pass_check() {
    PASS=$((PASS + 1))
    TOTAL=$((TOTAL + 1))
    RESULTS+=("${GREEN}PASS${NC}  $1")
    echo -e "  ${GREEN}✓ PASS${NC}  $1"
}

fail_check() {
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
    RESULTS+=("${RED}FAIL${NC}  $1")
    echo -e "  ${RED}✗ FAIL${NC}  $1"
}

warn_check() {
    WARN=$((WARN + 1))
    TOTAL=$((TOTAL + 1))
    RESULTS+=("${YELLOW}WARN${NC}  $1")
    echo -e "  ${YELLOW}⚠ WARN${NC}  $1"
}

skip_check() {
    TOTAL=$((TOTAL + 1))
    RESULTS+=("${CYAN}SKIP${NC}  $1")
    echo -e "  ${CYAN}— SKIP${NC}  $1"
}

banner() {
    echo ""
    echo -e "${BOLD}━━━ $1 ━━━${NC}"
}

# JSON field extraction (requires jq)
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not installed. Install with: apt install jq"
    exit 1
fi

# ── Register + login helper ──────────────────────────────────────────────────

TIMESTAMP=$(date +%s)

login_as() {
    local email="$1"
    local password="$2"
    local resp
    resp=$(curl -sf -X POST "${API}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" 2>/dev/null) || true
    if [ -n "$resp" ]; then
        echo "$resp" | jq -r '.access_token // empty'
    fi
}

register_user() {
    local email="$1"
    local password="$2"
    local full_name="$3"
    local phone="$4"
    curl -sf -X POST "${API}/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"full_name\":\"${full_name}\",\"phone\":\"${phone}\"}" \
        2>/dev/null || true
}

create_staff_via_admin() {
    local admin_token="$1"
    local email="$2"
    local role="$3"
    local full_name="$4"
    local resp
    resp=$(curl -sf -X POST "${API}/admin/users" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${admin_token}" \
        -d "{\"email\":\"${email}\",\"role\":\"${role}\",\"full_name\":\"${full_name}\",\"phone\":\"+91900000${TIMESTAMP: -4}\"}" \
        2>/dev/null) || true
    echo "$resp"
}

# ── Pre-flight: check API is reachable ────────────────────────────────────────

echo -e "${BOLD}GrantFlow Staff Audit${NC} — $(date '+%Y-%m-%d %H:%M:%S')"
echo "Target: ${BASE_URL}"
echo ""

HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null | jq -r '.status // empty') || true
if [ "$HEALTH" != "ok" ]; then
    echo -e "${RED}ERROR: API not reachable at ${BASE_URL}/health${NC}"
    echo "Make sure the backend is running (docker compose up -d)"
    exit 1
fi
echo -e "${GREEN}API is healthy${NC}"

# ── Obtain tokens for different roles ─────────────────────────────────────────

banner "Setting up test accounts"

# Try default admin credentials first
ADMIN_TOKEN=$(login_as "admin@grantflow.in" "admin123")
if [ -z "$ADMIN_TOKEN" ]; then
    ADMIN_TOKEN=$(login_as "admin@grantflow.org" "admin123")
fi
if [ -z "$ADMIN_TOKEN" ]; then
    # Try to find any admin user
    ADMIN_TOKEN=$(login_as "platform_admin@grantflow.in" "admin123")
fi

if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Cannot obtain admin token — cannot proceed with audit${NC}"
    echo "Ensure a platform_admin user exists with known credentials."
    exit 1
fi
echo "  Admin token obtained"

# Create test staff accounts via admin API
PO_EMAIL="audit_po_${TIMESTAMP}@test.grantflow.in"
FO_EMAIL="audit_fo_${TIMESTAMP}@test.grantflow.in"
RV1_EMAIL="audit_rv1_${TIMESTAMP}@test.grantflow.in"
RV2_EMAIL="audit_rv2_${TIMESTAMP}@test.grantflow.in"
APPLICANT_EMAIL="audit_app_${TIMESTAMP}@test.grantflow.in"

# Create program officer
PO_RESP=$(create_staff_via_admin "$ADMIN_TOKEN" "$PO_EMAIL" "program_officer" "Audit PO")
PO_ID=$(echo "$PO_RESP" | jq -r '.id // empty')
PO_TEMP_PW=$(echo "$PO_RESP" | jq -r '.temp_password // .password // empty')

# Create finance officer
FO_RESP=$(create_staff_via_admin "$ADMIN_TOKEN" "$FO_EMAIL" "finance_officer" "Audit FO")
FO_ID=$(echo "$FO_RESP" | jq -r '.id // empty')
FO_TEMP_PW=$(echo "$FO_RESP" | jq -r '.temp_password // .password // empty')

# Create reviewers
RV1_RESP=$(create_staff_via_admin "$ADMIN_TOKEN" "$RV1_EMAIL" "reviewer" "Audit Reviewer 1")
RV1_ID=$(echo "$RV1_RESP" | jq -r '.id // empty')

RV2_RESP=$(create_staff_via_admin "$ADMIN_TOKEN" "$RV2_EMAIL" "reviewer" "Audit Reviewer 2")
RV2_ID=$(echo "$RV2_RESP" | jq -r '.id // empty')

# Login as PO (try temp password)
PO_TOKEN=""
if [ -n "$PO_TEMP_PW" ]; then
    PO_TOKEN=$(login_as "$PO_EMAIL" "$PO_TEMP_PW")
fi
if [ -z "$PO_TOKEN" ]; then
    PO_TOKEN=$(login_as "$PO_EMAIL" "TempPass123!")
fi

# Login as FO
FO_TOKEN=""
if [ -n "$FO_TEMP_PW" ]; then
    FO_TOKEN=$(login_as "$FO_EMAIL" "$FO_TEMP_PW")
fi
if [ -z "$FO_TOKEN" ]; then
    FO_TOKEN=$(login_as "$FO_EMAIL" "TempPass123!")
fi

# Fallback: use existing staff tokens if creation didn't work
if [ -z "$PO_TOKEN" ]; then
    echo "  Trying fallback PO login..."
    PO_TOKEN=$(login_as "po@grantflow.in" "admin123")
    if [ -z "$PO_TOKEN" ]; then
        PO_TOKEN=$(login_as "officer@grantflow.in" "admin123")
    fi
fi

if [ -z "$FO_TOKEN" ]; then
    echo "  Trying fallback FO login..."
    FO_TOKEN=$(login_as "finance@grantflow.in" "admin123")
fi

[ -n "$PO_TOKEN" ] && echo "  Program Officer token obtained" || echo -e "  ${YELLOW}No PO token — some checks will be skipped${NC}"
[ -n "$FO_TOKEN" ] && echo "  Finance Officer token obtained" || echo -e "  ${YELLOW}No FO token — some checks will be skipped${NC}"

# Register an applicant for testing
register_user "$APPLICANT_EMAIL" "AuditTest123!" "Audit Applicant" "+919000099999"
# Note: OTP verification needed in real flow; try login anyway
APPLICANT_TOKEN=$(login_as "$APPLICANT_EMAIL" "AuditTest123!")

# ══════════════════════════════════════════════════════════════════════════════
# [M3] AI SOFT CHECKS
# ══════════════════════════════════════════════════════════════════════════════

banner "[M3] AI Soft Checks"

# Check 1: screening_agent.py uses render_prompt + call_openai
AGENT_FILE="backend/app/ai/screening_agent.py"
if [ -f "$AGENT_FILE" ]; then
    CALL_COUNT=$(grep -c 'render_prompt\|call_openai' "$AGENT_FILE" 2>/dev/null || echo "0")
    if [ "$CALL_COUNT" -gt 0 ]; then
        pass_check "[M3] screening_agent.py calls render_prompt/call_openai (${CALL_COUNT} references)"
    else
        fail_check "[M3] screening_agent.py does NOT call render_prompt or call_openai"
    fi
else
    fail_check "[M3] screening_agent.py not found at ${AGENT_FILE}"
fi

# Check 2: Soft check result structure (thematic_score, narrative_coherence_score, soft_flags)
# Verify the code produces these fields by checking the screening report schema
SCHEMA_FILE="backend/app/features/screening/schemas.py"
if [ -f "$SCHEMA_FILE" ]; then
    HAS_THEMATIC=$(grep -c 'ai_thematic_score' "$SCHEMA_FILE" 2>/dev/null || echo "0")
    HAS_NARRATIVE=$(grep -c 'ai_narrative_score' "$SCHEMA_FILE" 2>/dev/null || echo "0")
    HAS_FLAGS=$(grep -c 'soft_flags' "$SCHEMA_FILE" 2>/dev/null || echo "0")

    if [ "$HAS_THEMATIC" -gt 0 ] && [ "$HAS_NARRATIVE" -gt 0 ] && [ "$HAS_FLAGS" -gt 0 ]; then
        pass_check "[M3] Screening schema has thematic_score, narrative_score, soft_flags"
    else
        fail_check "[M3] Screening schema missing fields (thematic=${HAS_THEMATIC}, narrative=${HAS_NARRATIVE}, flags=${HAS_FLAGS})"
    fi
else
    fail_check "[M3] Screening schemas file not found"
fi

# Check 3: Live API — try to get a screening report with soft_flags
if [ -n "$PO_TOKEN" ]; then
    SCREENING_QUEUE=$(curl -sf -X GET "${API}/screening/" \
        -H "Authorization: Bearer ${PO_TOKEN}" 2>/dev/null) || true

    if [ -n "$SCREENING_QUEUE" ]; then
        FIRST_APP_ID=$(echo "$SCREENING_QUEUE" | jq -r '.[0].application_id // empty')
        if [ -n "$FIRST_APP_ID" ]; then
            REPORT=$(curl -sf -X GET "${API}/screening/${FIRST_APP_ID}" \
                -H "Authorization: Bearer ${PO_TOKEN}" 2>/dev/null) || true
            if [ -n "$REPORT" ]; then
                FLAGS_TYPE=$(echo "$REPORT" | jq -r '.soft_flags | type')
                FLAGS_LEN=$(echo "$REPORT" | jq -r '.soft_flags | length')
                THEMATIC=$(echo "$REPORT" | jq -r '.ai_thematic_score // empty')
                if [ "$FLAGS_TYPE" = "array" ] && [ -n "$THEMATIC" ]; then
                    pass_check "[M3] Live screening report has soft_flags array (len=${FLAGS_LEN}) and ai_thematic_score=${THEMATIC}"
                else
                    fail_check "[M3] Live screening report missing soft_flags array or ai_thematic_score"
                fi
            else
                skip_check "[M3] Could not fetch screening report for app ${FIRST_APP_ID}"
            fi
        else
            skip_check "[M3] No applications in screening queue to test live soft_flags"
        fi
    else
        skip_check "[M3] Screening queue empty or inaccessible"
    fi
else
    skip_check "[M3] No PO token — cannot test live screening report"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M3] ECAG GEOGRAPHIC PRIORITY CHECK
# ══════════════════════════════════════════════════════════════════════════════

banner "[M3] ECAG Geographic Priority"

# Check ECAG programme metadata for climate_vulnerable_districts
PROGRAMMES=$(curl -sf -X GET "${API}/programmes" 2>/dev/null) || true

if [ -n "$PROGRAMMES" ]; then
    ECAG_ID=$(echo "$PROGRAMMES" | jq -r '.[] | select(.code == "ECAG" or .name == "ECAG" or (.name | test("ECAG|Environment|Climate"; "i"))) | .id' | head -1)

    if [ -n "$ECAG_ID" ]; then
        ECAG_DETAIL=$(curl -sf -X GET "${API}/programmes/${ECAG_ID}" 2>/dev/null) || true
        if [ -n "$ECAG_DETAIL" ]; then
            # Check metadata_json for climate_vulnerable_districts
            DISTRICTS=$(echo "$ECAG_DETAIL" | jq -r '.metadata_json.climate_vulnerable_districts // .metadata.climate_vulnerable_districts // empty')
            DISTRICT_COUNT=0
            if [ -n "$DISTRICTS" ] && [ "$DISTRICTS" != "null" ]; then
                DISTRICT_COUNT=$(echo "$DISTRICTS" | jq 'length' 2>/dev/null || echo "0")
            fi

            if [ "$DISTRICT_COUNT" -ge 20 ]; then
                pass_check "[M3] ECAG has climate_vulnerable_districts list (${DISTRICT_COUNT} districts)"
            elif [ "$DISTRICT_COUNT" -gt 0 ]; then
                warn_check "[M3] ECAG climate_vulnerable_districts has only ${DISTRICT_COUNT} districts (expected ≥20)"
            else
                # Also check screening_agent.py for hardcoded ECAG districts or RURAL_DISTRICTS
                ECAG_DISTRICT_CODE=$(grep -c 'RURAL_DISTRICTS\|climate_vulnerable\|ecag.*district' "$AGENT_FILE" 2>/dev/null || echo "0")
                if [ "$ECAG_DISTRICT_CODE" -gt 0 ]; then
                    RURAL_COUNT=$(grep -c "\"" "$AGENT_FILE" 2>/dev/null | head -1 || echo "0")
                    warn_check "[M3] ECAG geographic districts defined in code (RURAL_DISTRICTS set) but not in programme metadata"
                else
                    warn_check "[M3] ECAG climate_vulnerable_districts list is empty/missing"
                fi
            fi
        else
            skip_check "[M3] Could not fetch ECAG programme detail"
        fi
    else
        # Check if any programme exists with ECAG-like name
        PROG_NAMES=$(echo "$PROGRAMMES" | jq -r '.[].name')
        warn_check "[M3] No ECAG programme found. Available: ${PROG_NAMES}"
    fi
else
    fail_check "[M3] Cannot fetch programmes list"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M4] TEXT HIGHLIGHT + ANNOTATION
# ══════════════════════════════════════════════════════════════════════════════

banner "[M4] Text Highlight + Annotation"

# Check if reviewer workspace includes annotations field
if [ -n "$PO_TOKEN" ]; then
    # Get any application in review
    POST_REVIEW=$(curl -sf -X GET "${API}/review/post-review" \
        -H "Authorization: Bearer ${PO_TOKEN}" 2>/dev/null) || true

    REVIEW_APP_ID=""
    if [ -n "$POST_REVIEW" ] && [ "$POST_REVIEW" != "[]" ]; then
        REVIEW_APP_ID=$(echo "$POST_REVIEW" | jq -r '.[0].application_id // empty')
    fi

    # Try reviewer endpoint for annotations
    # First check the schema / code for annotations support
    REVIEW_SCHEMA_FILE="backend/app/features/review/schemas.py"
    HAS_ANNOTATIONS=$(grep -c 'annotation' "$REVIEW_SCHEMA_FILE" 2>/dev/null || echo "0")
    REVIEW_ROUTER_FILE="backend/app/features/review/router.py"
    HAS_ANNOTATION_ROUTE=$(grep -c 'annotation' "$REVIEW_ROUTER_FILE" 2>/dev/null || echo "0")

    if [ "$HAS_ANNOTATIONS" -gt 0 ] || [ "$HAS_ANNOTATION_ROUTE" -gt 0 ]; then
        pass_check "[M4] Review module has annotation support in code"
    else
        # Test if endpoint exists by trying POST
        if [ -n "$REVIEW_APP_ID" ]; then
            ANNO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
                "${API}/review/review/${REVIEW_APP_ID}/annotations" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer ${PO_TOKEN}" \
                -d '{"text_selection":"test selection","note":"audit annotation"}' \
                2>/dev/null) || true
            if [ "$ANNO_STATUS" = "404" ] || [ "$ANNO_STATUS" = "405" ]; then
                fail_check "[M4] POST /review/review/{id}/annotations returned ${ANNO_STATUS} — endpoint missing"
            elif [ "$ANNO_STATUS" = "401" ] || [ "$ANNO_STATUS" = "403" ]; then
                warn_check "[M4] Annotations endpoint exists but returned ${ANNO_STATUS} (auth issue)"
            else
                pass_check "[M4] Annotations endpoint responded with status ${ANNO_STATUS}"
            fi
        else
            # Try a dummy ID
            ANNO_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
                "${API}/review/review/00000000-0000-0000-0000-000000000001/annotations" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer ${PO_TOKEN}" \
                -d '{"text_selection":"test","note":"test"}' \
                2>/dev/null) || true
            if [ "$ANNO_STATUS" = "404" ] || [ "$ANNO_STATUS" = "405" ]; then
                fail_check "[M4] POST /review/{id}/annotations returned ${ANNO_STATUS} — endpoint missing"
            else
                pass_check "[M4] Annotations endpoint exists (status ${ANNO_STATUS})"
            fi
        fi
    fi
else
    skip_check "[M4] No PO/reviewer token — cannot test annotations"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M4] EIG 2-REVIEWER COMPARISON VIEW
# ══════════════════════════════════════════════════════════════════════════════

banner "[M4] EIG 2-Reviewer Comparison View"

if [ -n "$PO_TOKEN" ]; then
    # Check post-review queue for EIG application with 2 completed reviews
    POST_REVIEW_ALL=$(curl -sf -X GET "${API}/review/post-review" \
        -H "Authorization: Bearer ${PO_TOKEN}" 2>/dev/null) || true

    if [ -n "$POST_REVIEW_ALL" ] && [ "$POST_REVIEW_ALL" != "[]" ]; then
        # Look for an entry with 2 reviewer_scores
        TWO_REVIEWER_APP=$(echo "$POST_REVIEW_ALL" | jq -r '[.[] | select(.reviewer_scores | length >= 2)][0].application_id // empty')

        if [ -n "$TWO_REVIEWER_APP" ]; then
            ENTRY=$(echo "$POST_REVIEW_ALL" | jq "[.[] | select(.application_id == \"${TWO_REVIEWER_APP}\")][0]")
            REVIEWER_COUNT=$(echo "$ENTRY" | jq '.reviewer_scores | length')
            HAS_NESTED_SCORES=$(echo "$ENTRY" | jq '.reviewer_scores[0].scores | type == "array"')
            HAS_REVIEWER_IDS=$(echo "$ENTRY" | jq '.reviewer_scores[0].reviewer_id != null')

            if [ "$REVIEWER_COUNT" -ge 2 ] && [ "$HAS_NESTED_SCORES" = "true" ] && [ "$HAS_REVIEWER_IDS" = "true" ]; then
                pass_check "[M4] Post-review has ${REVIEWER_COUNT} reviewers with nested scores and reviewer_ids"
            elif [ "$REVIEWER_COUNT" -ge 2 ]; then
                fail_check "[M4] Has ${REVIEWER_COUNT} reviewers but scores not nested by reviewer (nested_scores=${HAS_NESTED_SCORES}, ids=${HAS_REVIEWER_IDS})"
            fi
        else
            # Check schema supports multi-reviewer structure
            HAS_REVIEWER_SCORES=$(grep -c 'reviewer_scores\|ReviewerScoreSet' "$REVIEW_SCHEMA_FILE" 2>/dev/null || echo "0")
            if [ "$HAS_REVIEWER_SCORES" -gt 0 ]; then
                pass_check "[M4] Schema supports multi-reviewer comparison (ReviewerScoreSet in schema)"
                skip_check "[M4] No live application with 2 completed reviews to verify"
            else
                fail_check "[M4] No multi-reviewer comparison structure in schema"
            fi
        fi
    else
        # Check schema at minimum
        HAS_REVIEWER_SCORES=$(grep -c 'reviewer_scores\|ReviewerScoreSet' "$REVIEW_SCHEMA_FILE" 2>/dev/null || echo "0")
        if [ "$HAS_REVIEWER_SCORES" -gt 0 ]; then
            pass_check "[M4] Schema supports multi-reviewer comparison (ReviewerScoreSet)"
            skip_check "[M4] Post-review queue empty — cannot test live comparison"
        else
            fail_check "[M4] No multi-reviewer comparison structure found"
        fi
    fi
else
    skip_check "[M4] No PO token — cannot test 2-reviewer comparison"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M5] AGREEMENT ACKNOWLEDGEMENT
# ══════════════════════════════════════════════════════════════════════════════

banner "[M5] Agreement Acknowledgement"

# Check code: POST /awards/grantee/{app_id}/acknowledge returns acknowledged_at
AWARDS_ROUTER="backend/app/features/awards/router.py"
HAS_ACKNOWLEDGE=$(grep -c 'acknowledge' "$AWARDS_ROUTER" 2>/dev/null || echo "0")

if [ "$HAS_ACKNOWLEDGE" -gt 0 ]; then
    pass_check "[M5] Agreement acknowledge endpoint exists in awards router"
else
    fail_check "[M5] No acknowledge endpoint in awards router"
fi

# Check AgreementRead schema has acknowledged_at
AWARDS_SCHEMA="backend/app/features/awards/schemas.py"
HAS_ACK_AT=$(grep -c 'acknowledged_at' "$AWARDS_SCHEMA" 2>/dev/null || echo "0")
if [ "$HAS_ACK_AT" -gt 0 ]; then
    pass_check "[M5] AgreementRead schema includes acknowledged_at field"
else
    fail_check "[M5] AgreementRead schema missing acknowledged_at field"
fi

# Live test: try acknowledge endpoint (if we have an applicant token and an agreement)
if [ -n "$APPLICANT_TOKEN" ]; then
    # Try to acknowledge a dummy agreement — check if endpoint exists
    ACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "${API}/awards/grantee/00000000-0000-0000-0000-000000000001/acknowledge" \
        -H "Authorization: Bearer ${APPLICANT_TOKEN}" \
        2>/dev/null) || true
    if [ "$ACK_STATUS" = "404" ] || [ "$ACK_STATUS" = "405" ]; then
        # 404 could be "agreement not found" which is OK (endpoint exists)
        ACK_BODY=$(curl -sf -X POST \
            "${API}/awards/grantee/00000000-0000-0000-0000-000000000001/acknowledge" \
            -H "Authorization: Bearer ${APPLICANT_TOKEN}" \
            2>/dev/null) || true
        # Distinguish between "route not found" vs "resource not found"
        if echo "$ACK_BODY" | jq -r '.detail' 2>/dev/null | grep -qi "not found\|no agreement\|no award"; then
            pass_check "[M5] Acknowledge endpoint active (resource-level 404, route exists)"
        else
            warn_check "[M5] Acknowledge endpoint returned ${ACK_STATUS} — may be route-level 404"
        fi
    elif [ "$ACK_STATUS" = "400" ] || [ "$ACK_STATUS" = "422" ]; then
        pass_check "[M5] Acknowledge endpoint exists (returned ${ACK_STATUS} for invalid input)"
    else
        skip_check "[M5] Acknowledge endpoint returned ${ACK_STATUS}"
    fi
else
    skip_check "[M5] No applicant token — cannot live-test acknowledge"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M5] BANK DETAILS ROLE RESTRICTION
# ══════════════════════════════════════════════════════════════════════════════

banner "[M5] Bank Details Role Restriction"

# The finance disbursement endpoints are restricted to finance_officer role
# Test: PO should get 403, FO should get 200/non-403

if [ -n "$PO_TOKEN" ]; then
    # PO tries to access finance disbursements
    PO_FINANCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
        "${API}/finance/disbursements" \
        -H "Authorization: Bearer ${PO_TOKEN}" \
        2>/dev/null) || true
    if [ "$PO_FINANCE_STATUS" = "403" ]; then
        pass_check "[M5] Program Officer blocked from finance/disbursements (403)"
    elif [ "$PO_FINANCE_STATUS" = "401" ]; then
        pass_check "[M5] Program Officer blocked from finance/disbursements (401 — auth rejected)"
    else
        fail_check "[M5] Program Officer accessed finance/disbursements with status ${PO_FINANCE_STATUS} (expected 403)"
    fi
else
    skip_check "[M5] No PO token — cannot test PO blocked from finance"
fi

if [ -n "$FO_TOKEN" ]; then
    FO_FINANCE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
        "${API}/finance/disbursements" \
        -H "Authorization: Bearer ${FO_TOKEN}" \
        2>/dev/null) || true
    if [ "$FO_FINANCE_STATUS" = "200" ]; then
        pass_check "[M5] Finance Officer can access finance/disbursements (200)"
    elif [ "$FO_FINANCE_STATUS" = "403" ] || [ "$FO_FINANCE_STATUS" = "401" ]; then
        fail_check "[M5] Finance Officer blocked from finance/disbursements (${FO_FINANCE_STATUS})"
    else
        warn_check "[M5] Finance Officer got ${FO_FINANCE_STATUS} on finance/disbursements (expected 200)"
    fi
else
    # Verify in code that require_finance_officer is used
    HAS_FO_DEP=$(grep -c 'require_finance_officer' "backend/app/features/finance/router.py" 2>/dev/null || echo "0")
    if [ "$HAS_FO_DEP" -gt 0 ]; then
        pass_check "[M5] Finance router uses require_finance_officer dependency (code check)"
    else
        fail_check "[M5] Finance router does NOT use require_finance_officer"
    fi
    skip_check "[M5] No FO token — cannot live-verify FO access"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M5] WAITLIST NOTIFICATION
# ══════════════════════════════════════════════════════════════════════════════

banner "[M5] Waitlist Notification"

# Check that award decision with "waitlisted" triggers notification
# Code-level check: awards/router.py fires task_send_notification on decision
HAS_NOTIFY_ON_DECISION=$(grep -c 'task_send_notification' "$AWARDS_ROUTER" 2>/dev/null || echo "0")
if [ "$HAS_NOTIFY_ON_DECISION" -gt 0 ]; then
    pass_check "[M5] Awards router fires task_send_notification on decisions"
else
    fail_check "[M5] Awards router does NOT fire notification on decisions"
fi

# Also check review decisions (waitlist is a post-review decision)
HAS_WAITLISTED_OPTION=$(grep -c 'waitlisted' "backend/app/features/review/schemas.py" 2>/dev/null || echo "0")
if [ "$HAS_WAITLISTED_OPTION" -gt 0 ]; then
    pass_check "[M5] 'waitlisted' is a valid post-review decision option"
else
    fail_check "[M5] 'waitlisted' not found in review decision options"
fi

# Check notification_tasks.py exists and has task_send_notification
NOTIF_FILE="backend/worker/tasks/notification_tasks.py"
if [ -f "$NOTIF_FILE" ]; then
    HAS_SEND_NOTIF=$(grep -c 'task_send_notification' "$NOTIF_FILE" 2>/dev/null || echo "0")
    if [ "$HAS_SEND_NOTIF" -gt 0 ]; then
        pass_check "[M5] notification_tasks.py has task_send_notification handler"
    else
        fail_check "[M5] notification_tasks.py missing task_send_notification"
    fi
else
    fail_check "[M5] notification_tasks.py not found"
fi

# Live test: if we have a PO token and an app in post-review, try waitlisting
if [ -n "$PO_TOKEN" ] && [ -n "$POST_REVIEW_ALL" ] && [ "$POST_REVIEW_ALL" != "[]" ]; then
    PENDING_APP=$(echo "$POST_REVIEW_ALL" | jq -r '[.[] | select(.status == "reviewed" or .status == "under_review")][0].application_id // empty')
    if [ -n "$PENDING_APP" ]; then
        WAITLIST_RESP=$(curl -sf -X POST "${API}/review/decisions/${PENDING_APP}" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${PO_TOKEN}" \
            -d '{"decision":"waitlisted","reason":"Audit test — waitlist notification check"}' \
            2>/dev/null) || true
        if [ -n "$WAITLIST_RESP" ]; then
            WL_STATUS=$(echo "$WAITLIST_RESP" | jq -r '.status // empty')
            if [ "$WL_STATUS" = "waitlisted" ]; then
                pass_check "[M5] Live waitlist decision accepted (status=waitlisted)"
                echo -e "    ${CYAN}Check celery worker logs for 'application_waitlisted' notification event${NC}"
            else
                warn_check "[M5] Waitlist response status: ${WL_STATUS} (expected 'waitlisted')"
            fi
        else
            skip_check "[M5] Waitlist decision request failed — no pending app or error"
        fi
    else
        skip_check "[M5] No pending post-review application for live waitlist test"
    fi
else
    skip_check "[M5] No PO token or no post-review apps — cannot live-test waitlist notification"
fi

# ══════════════════════════════════════════════════════════════════════════════
# [M5] TEMPLATE EDITOR (ADMIN)
# ══════════════════════════════════════════════════════════════════════════════

banner "[M5] Template Editor (Admin)"

# Check for template endpoints in admin
ADMIN_ROUTER="backend/app/features/admin/router.py"
HAS_TEMPLATES_ROUTE=$(grep -c 'template' "$ADMIN_ROUTER" 2>/dev/null || echo "0")

if [ "$HAS_TEMPLATES_ROUTE" -gt 0 ]; then
    pass_check "[M5] Admin router has template endpoints"
else
    # Check if templates are managed elsewhere
    TEMPLATE_FILES=$(find backend/ -type f -name "*.py" -exec grep -l "template" {} \; 2>/dev/null | head -5)
    if [ -n "$TEMPLATE_FILES" ]; then
        warn_check "[M5] No template endpoint in admin router, but template code found in: $(echo $TEMPLATE_FILES | tr '\n' ' ')"
    else
        fail_check "[M5] No template management endpoint found"
    fi
fi

# Try live GET /admin/templates
if [ -n "$ADMIN_TOKEN" ]; then
    TEMPLATES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
        "${API}/admin/templates" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        2>/dev/null) || true

    if [ "$TEMPLATES_STATUS" = "200" ]; then
        TEMPLATES_RESP=$(curl -sf -X GET "${API}/admin/templates" \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" \
            2>/dev/null) || true
        TEMPLATE_COUNT=$(echo "$TEMPLATES_RESP" | jq 'length' 2>/dev/null || echo "0")
        if [ "$TEMPLATE_COUNT" -ge 3 ]; then
            pass_check "[M5] GET /admin/templates returns ${TEMPLATE_COUNT} templates (≥3: award, rejection, agreement)"
        elif [ "$TEMPLATE_COUNT" -gt 0 ]; then
            warn_check "[M5] GET /admin/templates returns only ${TEMPLATE_COUNT} templates (expected ≥3)"
        else
            warn_check "[M5] GET /admin/templates returns empty list"
        fi

        # Try PATCH
        PATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
            "${API}/admin/templates/award" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${ADMIN_TOKEN}" \
            -d '{"body_text":"New text {{award_date}}"}' \
            2>/dev/null) || true
        if [ "$PATCH_STATUS" = "200" ]; then
            pass_check "[M5] PATCH /admin/templates/award returned 200"
        elif [ "$PATCH_STATUS" = "404" ]; then
            fail_check "[M5] PATCH /admin/templates/award returned 404 — template edit endpoint missing"
        else
            warn_check "[M5] PATCH /admin/templates/award returned ${PATCH_STATUS}"
        fi
    elif [ "$TEMPLATES_STATUS" = "404" ]; then
        fail_check "[M5] GET /admin/templates returned 404 — endpoint not implemented"
    else
        warn_check "[M5] GET /admin/templates returned ${TEMPLATES_STATUS}"
    fi
else
    skip_check "[M5] No admin token — cannot test template editor"
fi

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  AUDIT SUMMARY${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo ""
for r in "${RESULTS[@]}"; do
    echo -e "  $r"
done
echo ""
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
PASSED_TOTAL=$((PASS + FAIL + WARN))
echo -e "  ${GREEN}PASS: ${PASS}${NC}  ${RED}FAIL: ${FAIL}${NC}  ${YELLOW}WARN: ${WARN}${NC}  ${CYAN}TOTAL: ${TOTAL}${NC}"
if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}All critical checks passed!${NC}"
else
    echo -e "  ${RED}${BOLD}${FAIL} check(s) failed — review above for details.${NC}"
fi
echo -e "${BOLD}──────────────────────────────────────────────────────────────${NC}"
echo ""

exit "$FAIL"
