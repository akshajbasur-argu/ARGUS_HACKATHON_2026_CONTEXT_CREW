#!/usr/bin/env bash
###############################################################################
# GrantFlow — Applicant-Facing Feature Audit Script
#
# Tests applicant-facing PRD requirements against the running backend.
# Usage:  bash scripts/audit_applicant.sh [BASE_URL]
#         Default BASE_URL = http://localhost:8000
###############################################################################
set -euo pipefail

BASE="${1:-http://localhost:8000}"
API="${BASE}/api/v1"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
TOTAL=0

# ── Colours (disabled if stdout is not a terminal) ──────────────────────────
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

# ── Helpers ─────────────────────────────────────────────────────────────────
pass() { ((PASS_COUNT++)); ((TOTAL++)); echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { ((FAIL_COUNT++)); ((TOTAL++)); echo -e "${RED}[FAIL]${NC} $1"; }
warn() { ((WARN_COUNT++)); ((TOTAL++)); echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
section() { echo; echo -e "${BOLD}━━━ $1 ━━━${NC}"; }

# silent curl that returns body; sets HTTP_CODE global
apicall() {
  local method="$1" url="$2"; shift 2
  local tmpfile; tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmpfile" -w '%{http_code}' -X "$method" \
    -H "Content-Type: application/json" "$@" "$url") || true
  BODY=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

# authenticated curl (uses $TOKEN)
authcall() {
  local method="$1" url="$2"; shift 2
  local tmpfile; tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmpfile" -w '%{http_code}' -X "$method" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    "$@" "$url") || true
  BODY=$(cat "$tmpfile")
  rm -f "$tmpfile"
}

# JSON field extractor (portable — uses python3 or jq)
json_field() {
  local field="$1" json="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r "$field" 2>/dev/null
  else
    echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1].replace('.','')))" "$field" 2>/dev/null || echo "null"
  fi
}

# JSON array length
json_len() {
  local json="$1"
  if command -v jq &>/dev/null; then
    echo "$json" | jq 'length' 2>/dev/null
  else
    echo "$json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0"
  fi
}

# python3 JSON helper (more reliable for complex queries)
py_json() {
  python3 -c "
import sys, json
data = json.loads(sys.argv[1])
$2
" "$1" 2>/dev/null
}

###############################################################################
#  PRE-FLIGHT: verify backend is reachable
###############################################################################
section "Pre-flight"
apicall GET "${BASE}/health"
if [ "$HTTP_CODE" = "200" ]; then
  pass "Backend reachable at ${BASE} (health → 200)"
else
  fail "Backend unreachable at ${BASE} (HTTP ${HTTP_CODE})"
  echo "Aborting — start the backend first."
  exit 1
fi

###############################################################################
#  [M1] PROGRAMME CATALOGUE
###############################################################################
section "M1 — Programme Catalogue"

# Test 1: GET /programmes returns 3 programmes (CDG, EIG, ECAG)
apicall GET "${API}/programmes"
if [ "$HTTP_CODE" = "200" ]; then
  PROG_COUNT=$(json_len "$BODY")
  if [ "$PROG_COUNT" -ge 3 ] 2>/dev/null; then
    # Check for CDG, EIG, ECAG codes
    HAS_ALL=$(py_json "$BODY" "
codes = {p['code'] for p in data}
print('yes' if {'CDG','EIG','ECAG'}.issubset(codes) else 'no')
")
    if [ "$HAS_ALL" = "yes" ]; then
      pass "M1 — Programme catalogue returns 3 programmes (CDG, EIG, ECAG)"
    else
      fail "M1 — Programme catalogue missing one of CDG/EIG/ECAG (got codes: $(py_json "$BODY" "print(','.join(p['code'] for p in data))"))"
    fi
  else
    fail "M1 — Programme catalogue returns ${PROG_COUNT} programmes (expected >= 3)"
  fi
else
  fail "M1 — GET /programmes returned HTTP ${HTTP_CODE}"
fi

# Test 2: Each programme has required fields
FIELD_CHECK=$(py_json "$BODY" "
required = ['name','funding_min_inr','funding_max_inr','duration_min_months','duration_max_months']
missing = []
for p in data:
    for f in required:
        if f not in p or p[f] is None:
            missing.append(f'{p.get(\"code\",\"?\")}:{f}')
print(','.join(missing) if missing else 'ok')
")
if [ "$FIELD_CHECK" = "ok" ]; then
  pass "M1 — Each programme has name, funding_min/max, duration_min/max"
else
  fail "M1 — Programme missing fields: ${FIELD_CHECK}"
fi

# Test 3: Application window present (serves as deadline proxy)
WINDOW_CHECK=$(py_json "$BODY" "
bad = []
for p in data:
    aw = p.get('application_window', {})
    if not aw or not aw.get('closes'):
        bad.append(p.get('code','?'))
print(','.join(bad) if bad else 'ok')
")
if [ "$WINDOW_CHECK" = "ok" ]; then
  pass "M1 — Each programme has application_window with deadline (closes)"
else
  warn "M1 — Programmes missing deadline (application_window.closes): ${WINDOW_CHECK}"
fi

# Test 4: GET /programmes/{id} returns full detail with eligibility_criteria
FIRST_ID=$(py_json "$BODY" "print(data[0]['id'])")
apicall GET "${API}/programmes/${FIRST_ID}"
if [ "$HTTP_CODE" = "200" ]; then
  HAS_CRITERIA=$(py_json "$BODY" "
ec = data.get('eligibility_criteria', [])
print('yes' if isinstance(ec, list) and len(ec) > 0 else 'no')
")
  if [ "$HAS_CRITERIA" = "yes" ]; then
    pass "M1 — Programme detail includes eligibility_criteria array"
  else
    fail "M1 — Programme detail missing eligibility_criteria array"
  fi
else
  fail "M1 — GET /programmes/{id} returned HTTP ${HTTP_CODE}"
fi

###############################################################################
#  [M1] ELIGIBILITY PRE-CHECK
###############################################################################
section "M1 — Eligibility Pre-Check"

# Test 5: Precheck with eligible NGO in rural district
apicall POST "${API}/programmes/precheck" \
  -d '{"org_type":"NGO","project_district":"araria","funding_amount_inr":500000}'
if [ "$HTTP_CODE" = "200" ]; then
  # Check CDG result has result + failed_rules fields
  CDG_CHECK=$(py_json "$BODY" "
cdg = [p for p in data if p['programme_code']=='CDG']
if cdg:
    p = cdg[0]
    has_result = 'result' in p
    has_rules = 'failed_rules' in p and isinstance(p['failed_rules'], list)
    print('yes' if has_result and has_rules else 'no')
else:
    print('no_cdg')
")
  if [ "$CDG_CHECK" = "yes" ]; then
    pass "M1 — Precheck returns CDG result with result + failed_rules fields"
  elif [ "$CDG_CHECK" = "no_cdg" ]; then
    fail "M1 — Precheck response does not include CDG programme"
  else
    fail "M1 — Precheck CDG result missing result or failed_rules field"
  fi
else
  fail "M1 — POST /programmes/precheck returned HTTP ${HTTP_CODE}"
fi

# Test 6: Precheck with invalid org_type → at least one rule fails with E1 code
apicall POST "${API}/programmes/precheck" \
  -d '{"org_type":"InvalidType","project_district":"araria","funding_amount_inr":500000}'
if [ "$HTTP_CODE" = "200" ]; then
  HAS_E1=$(py_json "$BODY" "
e1_found = False
for p in data:
    for rule in p.get('failed_rules', []):
        if 'E1' in rule.get('rule_code', ''):
            e1_found = True
            break
print('yes' if e1_found else 'no')
")
  if [ "$HAS_E1" = "yes" ]; then
    pass "M1 — Precheck with invalid org_type triggers E1 rule failure"
  else
    fail "M1 — Precheck with invalid org_type: no rule with code containing 'E1' failed"
  fi
else
  fail "M1 — POST /programmes/precheck (invalid org) returned HTTP ${HTTP_CODE}"
fi

###############################################################################
#  [M1] PERSONALISED ELIGIBILITY BANNER
###############################################################################
section "M1 — Personalised Eligibility Banner"

# Test 7: GET /organisations/me/eligibility
# First we need an applicant token — register a fresh user for testing
AUDIT_EMAIL="audit_test_$(date +%s)@test.local"
AUDIT_PASS="AuditPass123!"
apicall POST "${API}/auth/register" \
  -d "{
    \"email\":\"${AUDIT_EMAIL}\",
    \"password\":\"${AUDIT_PASS}\",
    \"full_name\":\"Audit Tester\",
    \"phone\":\"9876543210\",
    \"legal_name\":\"Audit Test NGO\",
    \"registration_number\":\"REG12345\",
    \"org_type\":\"ngo\",
    \"year_established\":2020,
    \"state\":\"Bihar\",
    \"annual_budget_inr\":500000,
    \"contact_person\":\"Audit Tester\"
  }"

if [ "$HTTP_CODE" = "201" ]; then
  info "Registered test applicant: ${AUDIT_EMAIL}"

  # Try to get OTP from response or backend logs
  # For hackathon, OTP is printed to console; try to log in directly
  # First attempt login (may fail if OTP verification is required)
  apicall POST "${API}/auth/login" \
    -d "{\"email\":\"${AUDIT_EMAIL}\",\"password\":\"${AUDIT_PASS}\"}"
  if [ "$HTTP_CODE" = "200" ]; then
    TOKEN=$(py_json "$BODY" "print(data['access_token'])")
    info "Login successful (OTP verification may not be enforced)"
  else
    info "Login failed (OTP may be required) — testing eligibility banner with unauthenticated call"
    TOKEN=""
  fi
else
  info "Registration returned HTTP ${HTTP_CODE} — attempting login with existing or default user"
  TOKEN=""
fi

# Test the eligibility banner endpoint
if [ -n "${TOKEN:-}" ]; then
  authcall GET "${API}/auth/organisations/me/eligibility"
  if [ "$HTTP_CODE" = "200" ]; then
    pass "M1 — Personalised eligibility banner endpoint returns 200"
  elif [ "$HTTP_CODE" = "404" ]; then
    fail "M1 — Personalised eligibility banner endpoint missing (404)"
  else
    warn "M1 — Personalised eligibility banner endpoint returned HTTP ${HTTP_CODE}"
  fi
else
  # Try without auth to see if endpoint exists at all
  apicall GET "${API}/auth/organisations/me/eligibility"
  if [ "$HTTP_CODE" = "404" ]; then
    fail "M1 — Personalised eligibility banner endpoint missing (404)"
  elif [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    warn "M1 — Eligibility banner endpoint exists (returned ${HTTP_CODE}) but could not test (no auth token)"
  else
    warn "M1 — Eligibility banner endpoint returned HTTP ${HTTP_CODE} (could not fully test)"
  fi
fi

###############################################################################
#  [M2] REGISTRATION + OTP
###############################################################################
section "M2 — Registration + OTP"

# Test 8: POST /auth/register → 200/201, message contains "OTP"
REG_EMAIL="audit_otp_$(date +%s)@test.local"
apicall POST "${API}/auth/register" \
  -d "{
    \"email\":\"${REG_EMAIL}\",
    \"password\":\"${AUDIT_PASS}\",
    \"full_name\":\"OTP Test User\",
    \"legal_name\":\"OTP Test Org\",
    \"org_type\":\"ngo\",
    \"year_established\":2021,
    \"state\":\"Bihar\",
    \"annual_budget_inr\":300000
  }"
if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  HAS_OTP_MSG=$(py_json "$BODY" "print('yes' if 'OTP' in str(data).upper() else 'no')")
  if [ "$HAS_OTP_MSG" = "yes" ]; then
    pass "M2 — POST /auth/register returns success with OTP mention"
  else
    warn "M2 — POST /auth/register succeeded but response doesn't mention OTP"
  fi
else
  fail "M2 — POST /auth/register returned HTTP ${HTTP_CODE}"
fi

# Test 9: Verify-OTP with wrong OTP → 400
apicall POST "${API}/auth/verify-otp" \
  -d "{\"email\":\"${REG_EMAIL}\",\"otp\":\"000000\"}"
if [ "$HTTP_CODE" = "400" ]; then
  pass "M2 — POST /auth/verify-otp with wrong OTP returns 400"
else
  fail "M2 — POST /auth/verify-otp with wrong OTP returned HTTP ${HTTP_CODE} (expected 400)"
fi

# Test 10: Verify-OTP with correct OTP (try to extract from Docker logs)
info "Attempting to extract OTP from backend logs..."
OTP_CODE=""

# Try docker compose logs first
if command -v docker &>/dev/null; then
  OTP_CODE=$(docker compose logs backend --tail=50 2>/dev/null \
    | grep -oP "OTP for ${REG_EMAIL}: \K[0-9]{6}" | tail -1) || true
fi

# Try docker logs with container name
if [ -z "$OTP_CODE" ] && command -v docker &>/dev/null; then
  for cname in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'backend\|web\|api' || true); do
    OTP_CODE=$(docker logs "$cname" --tail=50 2>/dev/null \
      | grep -oP "OTP for ${REG_EMAIL}: \K[0-9]{6}" | tail -1) || true
    [ -n "$OTP_CODE" ] && break
  done
fi

if [ -n "$OTP_CODE" ]; then
  info "Extracted OTP: ${OTP_CODE}"
  apicall POST "${API}/auth/verify-otp" \
    -d "{\"email\":\"${REG_EMAIL}\",\"otp\":\"${OTP_CODE}\"}"
  if [ "$HTTP_CODE" = "200" ]; then
    pass "M2 — POST /auth/verify-otp with correct OTP activates account"

    # Now login with this verified user for subsequent tests
    apicall POST "${API}/auth/login" \
      -d "{\"email\":\"${REG_EMAIL}\",\"password\":\"${AUDIT_PASS}\"}"
    if [ "$HTTP_CODE" = "200" ]; then
      TOKEN=$(py_json "$BODY" "print(data['access_token'])")
      info "Logged in as verified applicant for remaining tests"
    fi
  else
    fail "M2 — POST /auth/verify-otp with correct OTP returned HTTP ${HTTP_CODE}"
  fi
else
  warn "M2 — Could not extract OTP from logs (verify-otp with correct code not tested)"
  # Try logging in anyway (some setups auto-verify)
  apicall POST "${API}/auth/login" \
    -d "{\"email\":\"${REG_EMAIL}\",\"password\":\"${AUDIT_PASS}\"}"
  if [ "$HTTP_CODE" = "200" ]; then
    TOKEN=$(py_json "$BODY" "print(data['access_token'])")
    info "Login succeeded without OTP verification — using for subsequent tests"
  fi
fi

###############################################################################
#  [M2] APPLICATION WIZARD AUTO-SAVE
###############################################################################
section "M2 — Application Wizard Auto-Save"

if [ -z "${TOKEN:-}" ]; then
  warn "M2 — auto-save: Skipped (no auth token available)"
else
  # Get first programme ID for creating application
  apicall GET "${API}/programmes"
  PROG_ID=$(py_json "$BODY" "print(data[0]['id'])")

  # Test 11: Create a draft application
  authcall POST "${API}/applications" \
    -d "{\"programme_id\":\"${PROG_ID}\",\"form_data\":{\"project_title\":\"Audit Test Project\"}}"
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    APP_ID=$(py_json "$BODY" "print(data['id'])")
    pass "M2 — POST /applications creates draft application"

    # Test 12: Update the draft (auto-save)
    authcall PUT "${API}/applications/${APP_ID}" \
      -d '{"form_data":{"project_title":"Updated Audit Project","budget":"500000","description":"Auto-save test"}}'
    if [ "$HTTP_CODE" = "200" ]; then
      pass "M2 — PUT /applications/{id} saves draft data"

      # Test 13: Re-fetch and verify data persisted
      authcall GET "${API}/applications/${APP_ID}"
      if [ "$HTTP_CODE" = "200" ]; then
        DRAFT_CHECK=$(py_json "$BODY" "
fd = data.get('form_data', {})
if fd and fd.get('project_title') == 'Updated Audit Project':
    print('ok')
elif fd:
    print('partial')
else:
    print('empty')
")
        if [ "$DRAFT_CHECK" = "ok" ]; then
          pass "M2 — auto-save: GET /applications/{id} returns persisted draft_data (form_data)"
        elif [ "$DRAFT_CHECK" = "partial" ]; then
          warn "M2 — auto-save: form_data present but project_title not updated"
        else
          fail "M2 — auto-save: form_data field is empty or missing"
        fi
      else
        fail "M2 — GET /applications/{id} returned HTTP ${HTTP_CODE}"
      fi
    else
      fail "M2 — PUT /applications/{id} returned HTTP ${HTTP_CODE}"
    fi
  else
    fail "M2 — POST /applications returned HTTP ${HTTP_CODE} ($(py_json "$BODY" "print(data.get('detail',''))" 2>/dev/null || echo ""))"
  fi
fi

###############################################################################
#  [M2] STAGE TIMELINE SLA DATES
###############################################################################
section "M2 — Stage Timeline SLA Dates"

if [ -z "${TOKEN:-}" ] || [ -z "${APP_ID:-}" ]; then
  warn "M2 — timeline: Skipped (no auth token or application)"
else
  # Test 14: GET /applications/{id}/timeline
  authcall GET "${API}/applications/${APP_ID}/timeline"
  if [ "$HTTP_CODE" = "200" ]; then
    pass "M2 — GET /applications/{id}/timeline returns 200"

    # Test 15: Check timeline events have stage_name, status-like field, sla_date
    TIMELINE_CHECK=$(py_json "$BODY" "
events = data.get('events', [])
if not events:
    print('no_events')
else:
    has_stage = all('stage' in e or 'stage_name' in e for e in events)
    has_label = all('label' in e or 'status' in e for e in events)
    # Check if at least one event has sla_date (the current stage should)
    has_sla = any(e.get('sla_date') is not None for e in events)
    if has_stage and has_label and has_sla:
        print('ok')
    elif has_stage and has_label:
        print('no_sla')
    else:
        print('missing_fields')
")
    case "$TIMELINE_CHECK" in
      ok)
        pass "M2 — Timeline events have stage, label, and sla_date (expected_by)"
        ;;
      no_sla)
        fail "M2 — Timeline events have stage/label but sla_date (expected_by) is missing on all stages"
        ;;
      no_events)
        warn "M2 — Timeline returned 200 but events array is empty"
        ;;
      *)
        fail "M2 — Timeline events missing required fields (stage, label)"
        ;;
    esac
  elif [ "$HTTP_CODE" = "404" ]; then
    fail "M2 — GET /applications/{id}/timeline returned 404"
  else
    fail "M2 — GET /applications/{id}/timeline returned HTTP ${HTTP_CODE}"
  fi
fi

###############################################################################
#  [M7] NOTIFICATION EVENTS
###############################################################################
section "M7 — Notification Events"

# Test 16: Check notification_tasks.py and messaging/service.py for event types
NTASK_FILE="backend/worker/tasks/notification_tasks.py"
MSERV_FILE="backend/app/features/messaging/service.py"

# We scan the codebase for all event_type strings dispatched
info "Scanning backend source for notification event types..."

REQUIRED_EVENTS=(
  "application_submitted"
  "screening_eligible"
  "screening_ineligible"
  "clarification_requested"
  "award_approved"
  "application_rejected"
  "agreement_sent"
  "tranche_released"
  "report_due_reminder"
  "report_overdue"
  "report_approved"
)

# Gather all event types from EVENT_TITLES dict and actual dispatch calls
FOUND_EVENTS=""
BACKEND_DIR=""

# Try to find backend directory relative to script or CWD
for candidate in \
  "$(dirname "$0")/../backend" \
  "./backend" \
  "/home/akshajb@id.argusoft.com/Desktop/ARGUS_HACKATHON_2026_CONTEXT_CREW/backend"; do
  if [ -d "$candidate/app" ]; then
    BACKEND_DIR="$(cd "$candidate" && pwd)"
    break
  fi
done

if [ -n "$BACKEND_DIR" ]; then
  # Extract event types from EVENT_TITLES dict keys in messaging/service.py
  EVENT_TITLES_EVENTS=$(grep -oP '^\s*"([a-z_]+)"' "$BACKEND_DIR/app/features/messaging/service.py" 2>/dev/null \
    | sed 's/[" ]//g' | sort -u || true)

  # Extract event_type="..." from all backend code
  DISPATCH_EVENTS=$(grep -rhoP 'event_type[=:]\s*"([a-z_]+)"' "$BACKEND_DIR/app/" "$BACKEND_DIR/worker/" 2>/dev/null \
    | grep -oP '"[a-z_]+"' | tr -d '"' | sort -u || true)

  # Also capture dynamic event types like f"application_{body.decision.value}"
  # which expands to application_approved, application_rejected, application_waitlisted
  DYNAMIC_EVENTS=$(grep -rhoP 'f"application_\{.*\.value\}"' "$BACKEND_DIR/app/" 2>/dev/null || true)
  if [ -n "$DYNAMIC_EVENTS" ]; then
    DISPATCH_EVENTS="$DISPATCH_EVENTS
application_approved
application_rejected
application_waitlisted"
  fi

  # Also capture f"compliance_{body.action.value}" → compliance_approved, compliance_clarification
  DYNAMIC_COMPL=$(grep -rhoP 'f"compliance_\{.*\.value\}"' "$BACKEND_DIR/app/" 2>/dev/null || true)
  if [ -n "$DYNAMIC_COMPL" ]; then
    DISPATCH_EVENTS="$DISPATCH_EVENTS
compliance_approved
compliance_clarification
compliance_compliance_action"
  fi

  FOUND_EVENTS=$(echo -e "${EVENT_TITLES_EVENTS}\n${DISPATCH_EVENTS}" | sort -u | grep -v '^$')
  UNIQUE_COUNT=$(echo "$FOUND_EVENTS" | wc -l)

  info "Found ${UNIQUE_COUNT} unique event types in codebase"

  # Check each required event
  MISSING_EVENTS=()
  FOUND_REQUIRED=0
  for evt in "${REQUIRED_EVENTS[@]}"; do
    if echo "$FOUND_EVENTS" | grep -qx "$evt"; then
      ((FOUND_REQUIRED++))
    else
      # Check if it's covered by a variant (e.g., report_due_30 covers report_due_reminder)
      case "$evt" in
        report_due_reminder)
          if echo "$FOUND_EVENTS" | grep -q "report_due"; then
            ((FOUND_REQUIRED++))
            continue
          fi
          ;;
        award_approved)
          if echo "$FOUND_EVENTS" | grep -q "application_approved"; then
            ((FOUND_REQUIRED++))
            continue
          fi
          ;;
      esac
      MISSING_EVENTS+=("$evt")
    fi
  done

  if [ "$UNIQUE_COUNT" -ge 11 ]; then
    pass "M7 — Notification system defines >= 11 unique event types (found ${UNIQUE_COUNT})"
  else
    fail "M7 — Notification system defines only ${UNIQUE_COUNT} unique event types (need >= 11)"
  fi

  if [ ${#MISSING_EVENTS[@]} -eq 0 ]; then
    pass "M7 — All 11 required notification event types are present"
  else
    MISSING_STR=$(IFS=', '; echo "${MISSING_EVENTS[*]}")
    warn "M7 — Missing or variant-named notification events: ${MISSING_STR}"
    info "  (Some may be implemented under different names — check EVENT_TITLES in messaging/service.py)"
  fi

  # Show found events for reference
  info "Event types found: $(echo "$FOUND_EVENTS" | tr '\n' ', ' | sed 's/,$//')"
else
  warn "M7 — Cannot find backend source directory for code scan"
fi

###############################################################################
#  [AI] CHATBOT INTAKE
###############################################################################
section "AI — Chatbot Intake"

if [ -z "${TOKEN:-}" ]; then
  warn "AI — Chatbot intake: Skipped (no auth token available)"
else
  # Get programme ID
  apicall GET "${API}/programmes"
  CHAT_PROG_ID=$(py_json "$BODY" "print(data[0]['id'])")

  # Test 17: POST /applications/chat
  authcall POST "${API}/applications/chat" \
    -d "{\"programme_id\":\"${CHAT_PROG_ID}\",\"conversation_history\":[]}"

  if [ "$HTTP_CODE" = "200" ]; then
    CHAT_CHECK=$(py_json "$BODY" "
has_msg = 'assistant_message' in data and data['assistant_message']
has_field = 'next_field' in data
has_pct = 'progress_pct' in data
missing = []
if not has_msg: missing.append('assistant_message')
if not has_field: missing.append('next_field')
if not has_pct: missing.append('progress_pct')
print(','.join(missing) if missing else 'ok')
")
    if [ "$CHAT_CHECK" = "ok" ]; then
      pass "AI — Chatbot intake returns assistant_message, next_field, progress_pct"
    else
      fail "AI — Chatbot intake response missing fields: ${CHAT_CHECK}"
    fi
  elif [ "$HTTP_CODE" = "404" ]; then
    fail "AI — Chatbot intake endpoint not found (404)"
  elif [ "$HTTP_CODE" = "500" ]; then
    warn "AI — Chatbot intake returned 500 (endpoint exists but errored — check AI/LLM config)"
  else
    fail "AI — POST /applications/chat returned HTTP ${HTTP_CODE}"
  fi
fi

###############################################################################
#  SUMMARY
###############################################################################
echo
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  AUDIT SUMMARY${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}PASS:${NC} ${PASS_COUNT}"
echo -e "  ${RED}FAIL:${NC} ${FAIL_COUNT}"
echo -e "  ${YELLOW}WARN:${NC} ${WARN_COUNT}"
echo -e "  ${BOLD}Total: ${PASS_COUNT}/${TOTAL} checks passed${NC}"
echo

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}All critical checks passed!${NC}"
elif [ "$FAIL_COUNT" -le 3 ]; then
  echo -e "  ${YELLOW}Some checks failed — review above for details.${NC}"
else
  echo -e "  ${RED}Multiple failures detected — significant PRD gaps.${NC}"
fi
echo

exit "$FAIL_COUNT"
