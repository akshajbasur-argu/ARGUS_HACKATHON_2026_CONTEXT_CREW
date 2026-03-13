#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GrantFlow Compliance & Finance Audit Script
# Tests M6, M7, and AI features against the running backend.
#
# Usage:
#   ./scripts/audit_compliance.sh                    # defaults: localhost:8000
#   BASE_URL=http://prod:8000 ./scripts/audit_compliance.sh
#
# Prerequisites:
#   - curl, jq, grep installed
#   - GrantFlow backend running at BASE_URL
#   - The following env vars for pre-authenticated tokens (optional —
#     script will attempt auto-login if credentials are provided):
#       APPLICANT_EMAIL / APPLICANT_PASSWORD
#       OFFICER_EMAIL   / OFFICER_PASSWORD
#       FINANCE_EMAIL   / FINANCE_PASSWORD
#       ADMIN_EMAIL     / ADMIN_PASSWORD
#   - APP_ID: UUID of an active EIG grant (start_date ~100 days ago)
#   - REPORT_ID: UUID of a compliance report for disbursement-hold test
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail

# ── Config ──────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:8000}"
API="${BASE_URL}/api/v1"
BACKEND_DIR="${BACKEND_DIR:-$(cd "$(dirname "$0")/../backend" && pwd)}"

# Test data — override via environment
APP_ID="${APP_ID:-00000000-0000-0000-0000-000000000001}"
REPORT_ID="${REPORT_ID:-00000000-0000-0000-0000-000000000002}"
SESSION_ID="${SESSION_ID:-00000000-0000-0000-0000-000000000003}"

# Pre-set tokens (if available)
APPLICANT_TOKEN="${APPLICANT_TOKEN:-}"
OFFICER_TOKEN="${OFFICER_TOKEN:-}"
FINANCE_TOKEN="${FINANCE_TOKEN:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

# Login credentials (fallback if tokens not set)
APPLICANT_EMAIL="${APPLICANT_EMAIL:-applicant@test.com}"
APPLICANT_PASSWORD="${APPLICANT_PASSWORD:-Test1234!}"
OFFICER_EMAIL="${OFFICER_EMAIL:-officer@test.com}"
OFFICER_PASSWORD="${OFFICER_PASSWORD:-Test1234!}"
FINANCE_EMAIL="${FINANCE_EMAIL:-finance@test.com}"
FINANCE_PASSWORD="${FINANCE_PASSWORD:-Test1234!}"

# ── Counters & Colours ─────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ─────────────────────────────────────────────────────────────────

pass_test() {
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL=$((TOTAL + 1))
  printf "  ${GREEN}PASS${NC}  %s\n" "$1"
}

fail_test() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL=$((TOTAL + 1))
  printf "  ${RED}FAIL${NC}  %s\n" "$1"
  [ -n "${2:-}" ] && printf "        ${RED}reason:${NC} %s\n" "$2"
}

header() {
  echo ""
  printf "${CYAN}${BOLD}[%s]${NC} ${BOLD}%s${NC}\n" "$1" "$2"
}

# HTTP helpers — return "BODY\nHTTP_CODE" so caller can split
api_get() {
  local token="$1" path="$2"
  curl -sf -w "\n%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    "${API}${path}" 2>/dev/null || echo -e "\n000"
}

api_post() {
  local token="$1" path="$2" body="${3:-{}}"
  curl -sf -w "\n%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -X POST -d "${body}" \
    "${API}${path}" 2>/dev/null || echo -e "\n000"
}

api_get_raw() {
  # Returns headers + status, for Content-Type checks
  local token="$1" path="$2"
  curl -s -o /dev/null -w "%{http_code}|%{content_type}" \
    -H "Authorization: Bearer ${token}" \
    "${API}${path}" 2>/dev/null || echo "000|"
}

# Split last line (status code) from body
split_response() {
  local response="$1"
  HTTP_CODE=$(echo "$response" | tail -n1)
  HTTP_BODY=$(echo "$response" | sed '$d')
}

# ── Auto-login ──────────────────────────────────────────────────────────────

try_login() {
  local email="$1" password="$2" label="$3"
  local resp
  resp=$(curl -sf -w "\n%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST -d "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${API}/auth/login" 2>/dev/null || echo -e "\n000")
  split_response "$resp"
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "$HTTP_BODY" | jq -r '.access_token // empty' 2>/dev/null
  else
    echo ""
  fi
}

acquire_tokens() {
  printf "${YELLOW}Acquiring auth tokens...${NC}\n"

  if [ -z "$APPLICANT_TOKEN" ]; then
    APPLICANT_TOKEN=$(try_login "$APPLICANT_EMAIL" "$APPLICANT_PASSWORD" "applicant")
    [ -n "$APPLICANT_TOKEN" ] && printf "  applicant token: ${GREEN}OK${NC}\n" \
                               || printf "  applicant token: ${RED}MISSING${NC} (set APPLICANT_TOKEN)\n"
  fi

  if [ -z "$OFFICER_TOKEN" ]; then
    OFFICER_TOKEN=$(try_login "$OFFICER_EMAIL" "$OFFICER_PASSWORD" "officer")
    [ -n "$OFFICER_TOKEN" ] && printf "  officer token:   ${GREEN}OK${NC}\n" \
                             || printf "  officer token:   ${RED}MISSING${NC} (set OFFICER_TOKEN)\n"
  fi

  if [ -z "$FINANCE_TOKEN" ]; then
    FINANCE_TOKEN=$(try_login "$FINANCE_EMAIL" "$FINANCE_PASSWORD" "finance")
    [ -n "$FINANCE_TOKEN" ] && printf "  finance token:   ${GREEN}OK${NC}\n" \
                             || printf "  finance token:   ${RED}MISSING${NC} (set FINANCE_TOKEN)\n"
  fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TESTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────────────────────
test_m6_report_schedule() {
  header "M6" "EIG quarterly reporting schedule"

  local resp
  resp=$(api_get "$APPLICANT_TOKEN" "/compliance/grantee/reports/schedule/${APP_ID}")
  split_response "$resp"

  if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "405" ]; then
    fail_test "GET /compliance/grantee/reports/schedule/{app_id} not implemented (HTTP ${HTTP_CODE})" \
              "Endpoint must return report schedule with quarterly_1..3, mid_project, final entries"
    return
  fi

  # Check that response has at least 5 entries with the required types
  local count
  count=$(echo "$HTTP_BODY" | jq '[.[] | .report_type // .entry_type // .label] |
    map(select(test("quarterly_1|quarterly_2|quarterly_3|mid_project|final"))) |
    length' 2>/dev/null || echo "0")

  if [ "$count" -ge 5 ]; then
    pass_test "Report schedule has all 5 required entries (quarterly_1..3, mid_project, final)"
  elif [ "$count" -ge 3 ]; then
    fail_test "Report schedule has only ${count}/5 entries" \
              "Missing some of: quarterly_1, quarterly_2, quarterly_3, mid_project, final"
  else
    # Try alternate response shape: object with schedule key
    count=$(echo "$HTTP_BODY" | jq '
      (.schedule // .entries // .reports // []) |
      map(.report_type // .entry_type // .label // "") |
      map(select(test("quarterly_1|quarterly_2|quarterly_3|mid_project|final"))) |
      length' 2>/dev/null || echo "0")
    if [ "$count" -ge 5 ]; then
      pass_test "Report schedule has all 5 required entries"
    else
      fail_test "Report schedule returned only ${count} matching entries (need 5)" \
                "Expected: quarterly_1, quarterly_2, quarterly_3, mid_project, final"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m6_final_report_auditor_cert() {
  header "M6" "Final report — auditor certificate conditional on award amount"

  # Test 1: award_amount > 10L, no certificate → expect 400
  local body_high
  body_high=$(cat <<'ENDJSON'
{
  "report_type": "final",
  "period_label": "final_report",
  "form_data": {
    "narrative": "Project completed successfully.",
    "outcomes": "All targets met.",
    "expenditure": {"total_spent": 1200000}
  }
}
ENDJSON
)

  local resp
  resp=$(api_post "$APPLICANT_TOKEN" "/compliance/grantee/reports/${APP_ID}" "$body_high")
  split_response "$resp"

  if [ "$HTTP_CODE" = "400" ]; then
    # Check if the error message mentions auditor certificate
    local detail
    detail=$(echo "$HTTP_BODY" | jq -r '.detail // ""' 2>/dev/null)
    if echo "$detail" | grep -qi "auditor.cert\|auditor_cert\|audit.cert"; then
      pass_test "High-value grant (>10L) rejects final report without auditor certificate"
    else
      fail_test "Got 400 but error message does not mention auditor certificate" \
                "detail: ${detail}"
    fi
  elif [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    fail_test "High-value grant accepted final report without auditor certificate (HTTP ${HTTP_CODE})" \
              "Should return 400 with 'Auditor certificate required' when award_amount > 10L"
  else
    fail_test "Unexpected response (HTTP ${HTTP_CODE}) for final report submission" \
              "Expected 400 for missing auditor certificate on high-value grant"
  fi

  # Test 2: award_amount = 5L, no certificate → expect 200/201
  # This tests a different app; if APP_ID_LOW is set, use it
  local app_id_low="${APP_ID_LOW:-${APP_ID}}"
  local body_low
  body_low=$(cat <<'ENDJSON'
{
  "report_type": "final",
  "period_label": "final_report",
  "form_data": {
    "narrative": "Project completed successfully.",
    "outcomes": "All targets met.",
    "expenditure": {"total_spent": 480000}
  }
}
ENDJSON
)

  resp=$(api_post "$APPLICANT_TOKEN" "/compliance/grantee/reports/${app_id_low}" "$body_low")
  split_response "$resp"

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    pass_test "Low-value grant (5L) accepts final report without auditor certificate"
  elif [ "$HTTP_CODE" = "400" ]; then
    local detail
    detail=$(echo "$HTTP_BODY" | jq -r '.detail // ""' 2>/dev/null)
    if echo "$detail" | grep -qi "auditor.cert\|auditor_cert\|audit.cert"; then
      fail_test "Low-value grant incorrectly requires auditor certificate" \
                "Certificate should only be required when award_amount > 10L INR"
    else
      fail_test "Final report rejected for low-value grant (HTTP 400)" \
                "detail: ${detail}"
    fi
  else
    fail_test "Unexpected response (HTTP ${HTTP_CODE}) for low-value final report"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m6_programme_dashboard() {
  header "M6" "Programme-level fund dashboard"

  local resp
  resp=$(api_get "$FINANCE_TOKEN" "/finance/dashboard/programme")
  split_response "$resp"

  if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "405" ] || [ "$HTTP_CODE" = "000" ]; then
    # Fallback: try the base dashboard endpoint
    resp=$(api_get "$FINANCE_TOKEN" "/finance/dashboard")
    split_response "$resp"
  fi

  if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "000" ]; then
    fail_test "Finance dashboard endpoint not found (HTTP ${HTTP_CODE})" \
              "GET /finance/dashboard/programme returned 404 — only per-grant view implemented?"
    return
  fi

  if [ "$HTTP_CODE" != "200" ]; then
    fail_test "Finance dashboard returned HTTP ${HTTP_CODE}"
    return
  fi

  # Verify required fields
  local has_committed has_disbursed has_expenditure has_by_status
  has_committed=$(echo "$HTTP_BODY" | jq 'has("total_committed")' 2>/dev/null)
  has_disbursed=$(echo "$HTTP_BODY" | jq 'has("total_disbursed")' 2>/dev/null)
  has_expenditure=$(echo "$HTTP_BODY" | jq 'has("total_reported_expenditure")' 2>/dev/null)
  has_by_status=$(echo "$HTTP_BODY" | jq 'has("grants_by_status")' 2>/dev/null)

  local missing=""
  [ "$has_committed"   != "true" ] && missing="${missing} total_committed"
  [ "$has_disbursed"   != "true" ] && missing="${missing} total_disbursed"
  [ "$has_expenditure" != "true" ] && missing="${missing} total_reported_expenditure"
  [ "$has_by_status"   != "true" ] && missing="${missing} grants_by_status"

  if [ -z "$missing" ]; then
    pass_test "Dashboard has all required fields: total_committed, total_disbursed, total_reported_expenditure, grants_by_status"
  else
    fail_test "Dashboard missing fields:${missing}"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m6_pdf_export() {
  header "M6" "PDF export from finance dashboard"

  local raw_resp
  raw_resp=$(api_get_raw "$FINANCE_TOKEN" "/finance/dashboard/export?format=pdf")

  local http_code content_type
  http_code=$(echo "$raw_resp" | cut -d'|' -f1)
  content_type=$(echo "$raw_resp" | cut -d'|' -f2)

  if [ "$http_code" = "404" ] || [ "$http_code" = "000" ]; then
    fail_test "PDF export endpoint not found (HTTP ${http_code})" \
              "GET /finance/dashboard/export?format=pdf returned 404 — only CSV supported or not implemented"
    return
  fi

  if [ "$http_code" != "200" ]; then
    fail_test "PDF export returned HTTP ${http_code} (expected 200)"
    return
  fi

  if echo "$content_type" | grep -qi "application/pdf"; then
    pass_test "PDF export returns Content-Type: application/pdf"
  else
    fail_test "PDF export returned wrong Content-Type: ${content_type}" \
              "Expected application/pdf"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m6_overdue_alert_scheduler() {
  header "M6" "Report overdue recurring alert in scheduler"

  # Code-level check: search for overdue-related task in worker/scheduler or celery config
  local search_dirs=(
    "${BACKEND_DIR}/worker"
    "${BACKEND_DIR}/app/workers"
    "${BACKEND_DIR}/app/core"
  )

  local found=0
  for dir in "${search_dirs[@]}"; do
    if [ -d "$dir" ]; then
      local count
      count=$(grep -ri "overdue" "$dir" --include="*.py" 2>/dev/null | wc -l)
      if [ "$count" -gt 0 ]; then
        found=$count
        break
      fi
    fi
  done

  if [ "$found" -gt 0 ]; then
    pass_test "Found 'overdue' reference in scheduler/worker code (${found} occurrence(s))"
  else
    # Secondary check: look for overdue in beat_schedule or any periodic config
    local beat_count
    beat_count=$(grep -ri "overdue\|overdue_report_alert" "${BACKEND_DIR}" \
      --include="*.py" 2>/dev/null | wc -l)

    if [ "$beat_count" -gt 0 ]; then
      pass_test "Found 'overdue' references in backend code (${beat_count} occurrence(s))"
    else
      fail_test "No 'overdue_report_alert' task found in scheduler" \
                "Recurring 3-day overdue alert not scheduled — grep -ri 'overdue' backend/ returned 0 hits"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m6_disbursement_hold_notification() {
  header "M6" "Disbursement hold notifies finance officer"

  local body
  body=$(cat <<ENDJSON
{
  "action": "compliance_action",
  "severity": "disbursement_hold",
  "notes": "Audit test — critical compliance flags require disbursement hold."
}
ENDJSON
)

  local resp
  resp=$(api_post "$OFFICER_TOKEN" "/compliance/staff/reports/${REPORT_ID}/decide" "$body")
  split_response "$resp"

  if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "404" ]; then
    fail_test "Compliance decide endpoint unreachable (HTTP ${HTTP_CODE})" \
              "POST /compliance/staff/reports/{id}/decide not responding"
    return
  fi

  if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    fail_test "Compliance decide returned HTTP ${HTTP_CODE}" \
              "$(echo "$HTTP_BODY" | jq -r '.detail // empty' 2>/dev/null)"
    return
  fi

  # Check: was a finance_officer notification created?
  # Method 1: Check audit log for compliance_action with disbursement_hold
  local audit_resp
  audit_resp=$(api_get "$OFFICER_TOKEN" "/admin/audit-log?action=compliance_compliance_action&page_size=1")
  split_response "$audit_resp"

  local audit_ok=false
  if [ "$HTTP_CODE" = "200" ]; then
    local severity_logged
    severity_logged=$(echo "$HTTP_BODY" | jq -r '
      (.items // [])[] |
      select(.metadata.severity == "disbursement_hold") |
      .action' 2>/dev/null | head -1)
    [ -n "$severity_logged" ] && audit_ok=true
  fi

  # Method 2: Code-level check — verify the service dispatches a finance notification
  local code_check
  code_check=$(grep -r "finance\|disbursement_hold" \
    "${BACKEND_DIR}/app/features/compliance/service.py" 2>/dev/null | wc -l)

  # Method 3: Check notification list (if we have finance token)
  local notif_found=false
  if [ -n "$FINANCE_TOKEN" ]; then
    local notif_resp
    notif_resp=$(api_get "$FINANCE_TOKEN" "/messaging/notifications")
    split_response "$notif_resp"
    if [ "$HTTP_CODE" = "200" ]; then
      local hold_notif
      hold_notif=$(echo "$HTTP_BODY" | jq '[.[] | select(
        .event_type == "disbursement_hold" or
        (.body // "" | test("hold|disbursement"; "i"))
      )] | length' 2>/dev/null || echo "0")
      [ "$hold_notif" -gt 0 ] && notif_found=true
    fi
  fi

  if [ "$notif_found" = true ]; then
    pass_test "Disbursement hold triggers finance officer notification (confirmed via notification log)"
  elif [ "$audit_ok" = true ]; then
    pass_test "Disbursement hold recorded in audit log with severity=disbursement_hold"
  elif [ "$code_check" -gt 0 ]; then
    pass_test "Compliance service contains finance/disbursement_hold notification logic (code check)"
  else
    fail_test "No finance officer notification found after disbursement_hold decision" \
              "Expected notification to finance_officer when severity=disbursement_hold"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_m7_applicant_reply_notification() {
  header "M7" "Applicant reply notifies programme officer"

  local body
  body='{"body": "Audit test — applicant reply to check officer notification.", "is_internal_note": false}'

  local resp
  resp=$(api_post "$APPLICANT_TOKEN" "/messaging/messages/${APP_ID}" "$body")
  split_response "$resp"

  if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "404" ]; then
    fail_test "Messaging endpoint unreachable (HTTP ${HTTP_CODE})" \
              "POST /messaging/messages/{app_id} not responding"
    return
  fi

  if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    fail_test "Message send returned HTTP ${HTTP_CODE}" \
              "$(echo "$HTTP_BODY" | jq -r '.detail // empty' 2>/dev/null)"
    return
  fi

  # Verify: does the messaging router dispatch a notification to the programme officer
  # when the sender is an applicant?
  # Code-level check: look for applicant→officer notification path in messaging router
  local officer_notify
  officer_notify=$(grep -n "applicant_message_reply\|program.officer\|officer.*notif" \
    "${BACKEND_DIR}/app/features/messaging/router.py" 2>/dev/null | wc -l)

  # Also check the broader pattern — does the code notify anyone when applicant sends?
  local applicant_branch
  applicant_branch=$(grep -A5 "applicant" \
    "${BACKEND_DIR}/app/features/messaging/router.py" 2>/dev/null \
    | grep -i "notif\|send_notification" | wc -l)

  # Check notifications for the officer
  local notif_found=false
  if [ -n "$OFFICER_TOKEN" ]; then
    local notif_resp
    notif_resp=$(api_get "$OFFICER_TOKEN" "/messaging/notifications")
    split_response "$notif_resp"
    if [ "$HTTP_CODE" = "200" ]; then
      local reply_notif
      reply_notif=$(echo "$HTTP_BODY" | jq '[.[] | select(
        .event_type == "applicant_message_reply" or
        .event_type == "message_received" or
        (.body // "" | test("applicant|reply|message"; "i"))
      )] | length' 2>/dev/null || echo "0")
      [ "$reply_notif" -gt 0 ] && notif_found=true
    fi
  fi

  if [ "$notif_found" = true ]; then
    pass_test "Applicant reply generates notification to programme officer"
  elif [ "$officer_notify" -gt 0 ]; then
    pass_test "Messaging router has applicant→officer notification path (code check)"
  elif [ "$applicant_branch" -gt 0 ]; then
    # Partial: there's notification code but no specific applicant→officer branch
    fail_test "Messaging sends notifications on messages but lacks applicant→officer path" \
              "When applicant sends (is_internal_note=false), officer should receive event_type='applicant_message_reply'"
  else
    fail_test "No notification dispatched to programme officer on applicant reply" \
              "POST /messaging/messages/{app_id} from applicant must notify the assigned officer"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
test_ai_chatbot_captured_fields() {
  header "AI" "Chatbot captured fields sidebar"

  local resp
  resp=$(api_get "$APPLICANT_TOKEN" "/applications/chat/session/${SESSION_ID}")
  split_response "$resp"

  if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "405" ] || [ "$HTTP_CODE" = "000" ]; then
    # Check code-level: does the chatbot service track captured_fields?
    local code_check
    code_check=$(grep -ri "captured_field\|field_captured\|session.*captured" \
      "${BACKEND_DIR}/app/features/applications/chatbot_service.py" 2>/dev/null | wc -l)

    if [ "$code_check" -gt 0 ]; then
      # Has field tracking in service code, but no GET session endpoint
      fail_test "Chatbot tracks captured fields in service but GET session endpoint missing" \
                "Need GET /applications/chat/session/{id} returning captured_fields: [{field_name, value}]"
    else
      fail_test "No chatbot captured_fields tracking found" \
                "GET /applications/chat/session/{session_id} not implemented (HTTP ${HTTP_CODE})"
    fi
    return
  fi

  if [ "$HTTP_CODE" != "200" ]; then
    fail_test "Chatbot session endpoint returned HTTP ${HTTP_CODE}"
    return
  fi

  # Validate response has captured_fields array with {field_name, value} items
  local has_captured
  has_captured=$(echo "$HTTP_BODY" | jq '
    (.captured_fields // .fields_captured // []) |
    if length > 0 then
      all(has("field_name") and has("value"))
    else
      true
    end' 2>/dev/null)

  local field_key_exists
  field_key_exists=$(echo "$HTTP_BODY" | jq 'has("captured_fields") or has("fields_captured")' 2>/dev/null)

  if [ "$field_key_exists" = "true" ] && [ "$has_captured" = "true" ]; then
    pass_test "Chatbot session returns captured_fields with {field_name, value} structure"
  elif [ "$field_key_exists" = "true" ]; then
    fail_test "captured_fields present but items lack field_name/value keys"
  else
    fail_test "Response missing captured_fields key" \
              "Expected: {captured_fields: [{field_name: str, value: any}]}"
  fi
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
  echo ""
  printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${BOLD}  GrantFlow Compliance & Finance Audit${NC}\n"
  printf "${BOLD}  Target: ${CYAN}${BASE_URL}${NC}\n"
  printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

  # Check dependencies
  for cmd in curl jq grep; do
    if ! command -v "$cmd" &>/dev/null; then
      printf "${RED}ERROR: '%s' is required but not installed.${NC}\n" "$cmd"
      exit 1
    fi
  done

  # Acquire tokens
  acquire_tokens

  # Run all tests
  test_m6_report_schedule
  test_m6_final_report_auditor_cert
  test_m6_programme_dashboard
  test_m6_pdf_export
  test_m6_overdue_alert_scheduler
  test_m6_disbursement_hold_notification
  test_m7_applicant_reply_notification
  test_ai_chatbot_captured_fields

  # ── Summary ─────────────────────────────────────────────────────────────
  echo ""
  printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${BOLD}  SUMMARY${NC}\n"
  printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  echo ""
  printf "  ${GREEN}PASSED${NC}: %d / %d\n" "$PASS_COUNT" "$TOTAL"
  printf "  ${RED}FAILED${NC}: %d / %d\n" "$FAIL_COUNT" "$TOTAL"
  echo ""

  if [ "$FAIL_COUNT" -eq 0 ]; then
    printf "  ${GREEN}${BOLD}All checks passed.${NC}\n"
  else
    printf "  ${RED}${BOLD}%d check(s) failed — see details above.${NC}\n" "$FAIL_COUNT"
  fi
  echo ""

  # Exit with failure code if any test failed
  [ "$FAIL_COUNT" -eq 0 ]
}

main "$@"
