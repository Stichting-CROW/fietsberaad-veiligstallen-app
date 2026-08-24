#!/usr/bin/env bash
#
# Manual test walkthrough for FMS API v2/v3 write endpoints.
# For human testers — prints each case, shows the curl command, optionally runs it,
# and lets you mark pass / fail / skip.
#
# Usage:
#   cd /path/to/fietsberaad-veiligstallen-app
#   bash scripts/manual-test-fms-writes.sh
#
# Optional env (from shell or .env in project root):
#   BASE_URL          default http://localhost:3000
#   FMS_TEST_USER     Basic auth username (default testgemeente-api)
#   FMS_TEST_PASS     Basic auth password (required)
#
# You will be prompted for stalling scope if not set:
#   CITYCODE, BIKEPARK, SECTION, PLACE, SUBSCRIPTION_TYPE_ID
#
# Prerequisites on the server under test:
#   - ENABLE_WRITE_API=true
#   - Dev server running (npm run dev) or acceptance URL
#   - Test account with operator permit on the chosen stalling (testgemeente recommended)
#   - Only test against testgemeente / non-production data

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env without overriding variables already set in the shell
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
FMS_TEST_USER="${FMS_TEST_USER:-testgemeente-api}"
RUN_ID="$(date +%Y%m%d%H%M%S)"
PASS_PREFIX="MANUAL_${RUN_ID}_"

# Filled during setup / reused across cases
CITYCODE="${CITYCODE:-}"
BIKEPARK="${BIKEPARK:-}"
SECTION="${SECTION:-}"
PLACE="${PLACE:-}"
SUBSCRIPTION_TYPE_ID="${SUBSCRIPTION_TYPE_ID:-7}"
LAST_SUBSCRIPTION_ID=""

PASSED=0
FAILED=0
SKIPPED=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

hr() { printf '\n%s\n\n' "────────────────────────────────────────────────────────"; }

prompt() {
  local msg="$1"
  local default="${2:-}"
  if [[ -n "$default" ]]; then
    read -r -p "$msg [$default]: " reply
    echo "${reply:-$default}"
  else
    read -r -p "$msg: " reply
    echo "$reply"
  fi
}

require_pass() {
  if [[ -z "${FMS_TEST_PASS:-}" ]]; then
    echo -e "${RED}FMS_TEST_PASS is not set.${NC}"
    echo "Set it in .env or export FMS_TEST_PASS=... before running this script."
    exit 1
  fi
}

setup_scope() {
  hr
  echo -e "${BOLD}Setup — test scope${NC}"
  echo "Use testgemeente stallings only (e.g. citycode 9933, stalling 9933_001, section 9933_001_1)."
  echo "Find values in the admin UI or via GET /api/fms/v3/citycodes/9933/locations"
  hr

  CITYCODE="$(prompt "Citycode (gemeentecode)" "${CITYCODE:-9933}")"
  BIKEPARK="$(prompt "Bikepark / location ID (StallingsID)" "${BIKEPARK:-9933_001}")"
  SECTION="$(prompt "Section external ID" "${SECTION:-${BIKEPARK}_1}")"
  PLACE="$(prompt "Place ID (numeric plek id, for locker/place tests)" "${PLACE:-}")"
  SUBSCRIPTION_TYPE_ID="$(prompt "Subscription type ID for abonnement tests" "${SUBSCRIPTION_TYPE_ID}")"

  BASE_URL="$(prompt "Base URL" "$BASE_URL")"
  FMS_TEST_USER="$(prompt "Basic auth username" "$FMS_TEST_USER")"
  if [[ -z "${FMS_TEST_PASS:-}" ]]; then
    FMS_TEST_PASS="$(prompt "Basic auth password (hidden)" "")"
  fi

  hr
  echo -e "${CYAN}Session pass ID prefix:${NC} ${PASS_PREFIX}…"
  echo -e "${CYAN}Auth:${NC} ${FMS_TEST_USER} @ ${BASE_URL}"
  echo -e "${CYAN}Scope:${NC} ${CITYCODE} / ${BIKEPARK} / ${SECTION} / place=${PLACE:-?}"
  hr
  read -r -p "Press Enter to start the test walkthrough (Ctrl+C to abort)…"
}

auth_header() {
  printf 'Authorization: Basic %s' "$(printf '%s:%s' "$FMS_TEST_USER" "$FMS_TEST_PASS" | base64 -w0 2>/dev/null || printf '%s:%s' "$FMS_TEST_USER" "$FMS_TEST_PASS" | base64)"
}

# $1=id $2=title $3=method $4=url-path $5=body-json $6=expected-note $7=extra-query (optional)
run_case() {
  local id="$1" title="$2" method="$3" url_path="$4" body="$5" expected="$6"
  local query="${7:-}"
  TOTAL=$((TOTAL + 1))

  hr
  echo -e "${BOLD}[$id] $title${NC}"
  echo -e "${CYAN}Method:${NC} $method"
  echo -e "${CYAN}Path:${NC} ${url_path}${query}"
  echo -e "${CYAN}Expected:${NC} $expected"
  if [[ -n "$body" ]]; then
    echo -e "${CYAN}Body:${NC}"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
  fi

  local url="${BASE_URL}${url_path}${query}"
  local curl_cmd=(
    curl -sS -w "\n\nHTTP %{http_code}\n"
    -X "$method"
    -H "Content-Type: application/json"
    -H "$(auth_header)"
  )
  if [[ -n "$body" ]]; then
    curl_cmd+=(-d "$body")
  fi
  curl_cmd+=("$url")

  echo
  echo -e "${YELLOW}Copy-paste (Postman/Insomnia: Basic auth, same URL/body):${NC}"
  local quoted_body
  quoted_body="$(printf '%q' "$body")"
  echo "curl -sS -X $method -u '${FMS_TEST_USER}:<password>' -H 'Content-Type: application/json' ${quoted_body:+-d $quoted_body} '${url}'"
  echo

  while true; do
    read -r -p "Action? [Enter=run, c=copy only done, s=skip, p=pass, f=fail, q=quit]: " action
    case "${action:-}" in
      q|Q)
        summary
        exit 0
        ;;
      s|S)
        echo -e "${YELLOW}Skipped${NC}"
        SKIPPED=$((SKIPPED + 1))
        return
        ;;
      p|P)
        echo -e "${GREEN}Marked pass${NC}"
        PASSED=$((PASSED + 1))
        return
        ;;
      f|F)
        echo -e "${RED}Marked fail${NC}"
        FAILED=$((FAILED + 1))
        return
        ;;
      c|C)
        echo "OK — mark result when you ran it elsewhere:"
        read -r -p "  p=pass / f=fail / s=skip: " result
        case "$result" in
          p|P) PASSED=$((PASSED + 1)) ;;
          f|F) FAILED=$((FAILED + 1)) ;;
          *) SKIPPED=$((SKIPPED + 1)) ;;
        esac
        return
        ;;
      "")
        echo -e "${CYAN}Response:${NC}"
        "${curl_cmd[@]}" || true
        echo
        read -r -p "Result? [p=pass / f=fail / s=skip]: " result
        case "$result" in
          p|P) PASSED=$((PASSED + 1)); echo -e "${GREEN}Pass${NC}" ;;
          f|F) FAILED=$((FAILED + 1)); echo -e "${RED}Fail${NC}" ;;
          *) SKIPPED=$((SKIPPED + 1)); echo -e "${YELLOW}Skip${NC}" ;;
        esac
        return
        ;;
      *)
        echo "Unknown option."
        ;;
    esac
  done
}

iso_past() {
  date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

run_v2_tests() {
  local ts pass pass2 barcode ext_id checkin checkout
  ts="$(iso_past)"
  pass="${PASS_PREFIX}bike1"
  pass2="${PASS_PREFIX}tx1"
  barcode="BC-${RUN_ID}"
  ext_id="MT-${RUN_ID}"

  echo -e "\n${BOLD}═══ FMS API v2 write methods ═══${NC}\n"

  run_case "v2-01" "saveJsonBike — register one bike/pass" POST \
    "/api/fms/v2/saveJsonBike/${BIKEPARK}" \
    "{\"barcode\":\"${barcode}\",\"passID\":\"${pass}\",\"biketypeID\":1}" \
    "HTTP 200, status: 1, id present (wachtrij row)"

  run_case "v2-02" "saveJsonBikes — register multiple bikes" POST \
    "/api/fms/v2/saveJsonBikes/${BIKEPARK}" \
    "[{\"barcode\":\"${barcode}-2\",\"passID\":\"${PASS_PREFIX}bike2\",\"biketypeID\":1}]" \
    "HTTP 200, status: 1, ids array"

  run_case "v2-03" "uploadJsonTransaction — check-in" POST \
    "/api/fms/v2/uploadJsonTransaction/${BIKEPARK}/${SECTION}" \
    "{\"type\":\"in\",\"transactionDate\":\"${ts}\",\"passID\":\"${pass2}\",\"idtype\":0}" \
    "HTTP 200, status: 1, id present"

  run_case "v2-04" "uploadJsonTransactions — batch check-in/out" POST \
    "/api/fms/v2/uploadJsonTransactions/${BIKEPARK}/${SECTION}" \
    "[{\"type\":\"in\",\"transactionDate\":\"${ts}\",\"passID\":\"${PASS_PREFIX}batch1\",\"idtype\":0},{\"type\":\"out\",\"transactionDate\":\"$(iso_now)\",\"passID\":\"${PASS_PREFIX}batch1\",\"idtype\":0}]" \
    "HTTP 200, status: 1, ids array"

  run_case "v2-05" "addJsonSaldo — top up balance" POST \
    "/api/fms/v2/addJsonSaldo/${BIKEPARK}" \
    "{\"passID\":\"${PASS_PREFIX}saldo1\",\"transactionDate\":\"${ts}\",\"amount\":10,\"paymentTypeID\":1}" \
    "HTTP 200, status: 1"

  run_case "v2-06" "addJsonSaldos — batch top up" POST \
    "/api/fms/v2/addJsonSaldos/${BIKEPARK}" \
    "[{\"passID\":\"${PASS_PREFIX}saldo2\",\"transactionDate\":\"${ts}\",\"amount\":5,\"paymentTypeID\":1}]" \
    "HTTP 200, status: 1, ids array"

  run_case "v2-07" "syncSector — sector sync" PUT \
    "/api/fms/v2/syncSector/${BIKEPARK}/${SECTION}" \
    "{\"transactionDate\":\"${ts}\",\"bikes\":[{\"idcode\":\"${PASS_PREFIX}sync1\",\"idtype\":0,\"transactiondate\":\"${ts}\"}]}" \
    "HTTP 200, status: 1"

  run_case "v2-08" "reportOccupationData — occupation snapshot" POST \
    "/api/fms/v2/reportOccupationData/${BIKEPARK}/${SECTION}" \
    "{\"occupation\":3,\"timestamp\":\"${ts}\",\"capacity\":50,\"checkins\":1,\"checkouts\":0,\"interval\":15}" \
    "HTTP 200, status: 1"

  run_case "v2-09" "reportJsonOccupationData — alias of occupation report" POST \
    "/api/fms/v2/reportJsonOccupationData/${BIKEPARK}/${SECTION}" \
    "{\"occupation\":4,\"timestamp\":\"${ts}\",\"capacity\":50}" \
    "HTTP 200, status: 1"

  if [[ -n "$PLACE" ]]; then
    run_case "v2-10" "updateLocker — locker status update" POST \
      "/api/fms/v2/updateLocker/${BIKEPARK}/${SECTION}/${PLACE}" \
      "{\"statuscode\":1,\"transactionDate\":\"${ts}\",\"typeCheck\":\"user\"}" \
      "HTTP 200, status: 1"

    run_case "v2-11" "setUrlWebserviceForLocker — set locker webservice URL" POST \
      "/api/fms/v2/setUrlWebserviceForLocker/${BIKEPARK}/${SECTION}/${PLACE}" \
      "{\"url\":\"https://example.test/locker/${RUN_ID}\"}" \
      "HTTP 200, status: 1"
  else
    echo -e "${YELLOW}[v2-10/v2-11 skipped] Set PLACE at setup for locker tests.${NC}"
    SKIPPED=$((SKIPPED + 2))
    TOTAL=$((TOTAL + 2))
  fi

  run_case "v2-12" "addSubscription — create subscription" POST \
    "/api/fms/v2/addSubscription/${BIKEPARK}" \
    "{\"subscriptiontypeID\":${SUBSCRIPTION_TYPE_ID},\"passID\":\"${PASS_PREFIX}sub1\",\"amount\":0,\"paymentTypeID\":1,\"transactionDate\":\"${ts}\"}" \
    "HTTP 200, status: 1, id = subscription ID (note for subscribe test)"

  echo
  read -r -p "If addSubscription returned an id, enter it for subscribe test (or Enter to skip v2-13): " LAST_SUBSCRIPTION_ID
  if [[ -n "$LAST_SUBSCRIPTION_ID" ]]; then
    run_case "v2-13" "subscribe — link pass to subscription" POST \
      "/api/fms/v2/subscribe/${BIKEPARK}" \
      "{\"subscriptionID\":${LAST_SUBSCRIPTION_ID},\"passID\":\"${PASS_PREFIX}sub1\"}" \
      "HTTP 200, status: 1"
  else
    echo -e "${YELLOW}[v2-13 skipped] No subscription ID.${NC}"
    SKIPPED=$((SKIPPED + 1))
    TOTAL=$((TOTAL + 1))
  fi

  # Optional: shadow tables target
  echo
  read -r -p "Also run v2-03 against new_wachtrij_* (?target=new)? [y/N]: " new_target
  if [[ "${new_target,,}" == "y" ]]; then
    run_case "v2-03b" "uploadJsonTransaction — check-in (shadow tables)" POST \
      "/api/fms/v2/uploadJsonTransaction/${BIKEPARK}/${SECTION}" \
      "{\"type\":\"in\",\"transactionDate\":\"${ts}\",\"passID\":\"${PASS_PREFIX}new1\",\"idtype\":0}" \
      "HTTP 200, row in new_wachtrij_transacties" \
      "?target=new"
  fi
}

run_v3_tests() {
  local ts pass ext_id checkin checkout v3base
  ts="$(iso_past)"
  checkin="$(iso_past)"
  checkout="$(iso_now)"
  pass="${PASS_PREFIX}v3tx"
  ext_id="V3MT-${RUN_ID}"
  v3base="/api/fms/v3/citycodes/${CITYCODE}/locations/${BIKEPARK}"

  echo -e "\n${BOLD}═══ FMS API v3 write methods ═══${NC}\n"

  run_case "v3-01" "POST …/locations/{id}/subscriptions" POST \
    "${v3base}/subscriptions" \
    "{\"subscription\":{\"subscriptiontypeid\":${SUBSCRIPTION_TYPE_ID},\"idcode\":\"${PASS_PREFIX}v3sub\",\"cost\":0,\"startdate\":\"${ts}\"}}" \
    "HTTP 200, status: 1, subscriptionid"

  run_case "v3-02" "POST …/locations/{id}/completedtransactions" POST \
    "${v3base}/completedtransactions" \
    "{\"completedtransaction\":{\"checkindate\":\"${checkin}\",\"checkoutdate\":\"${checkout}\",\"checkintype\":\"user\",\"typecheckout\":\"user\",\"price\":0,\"clienttypeid\":1,\"biketypeid\":1}}" \
    "HTTP 200, status: 1 (archive row)"

  run_case "v3-03" "POST …/locations/{id}/managedtransactions" POST \
    "${v3base}/managedtransactions" \
    "{\"managedtransaction\":{\"externaltransactionid\":\"${ext_id}-loc\",\"idcode\":\"${pass}\",\"idtype\":0,\"checkindate\":\"${checkin}\",\"checkintype\":\"user\",\"sectionid\":\"${SECTION}\"}}" \
    "HTTP 200, status: 1"

  run_case "v3-03b" "POST …/locations/{id}/managedtransactions (batch)" POST \
    "${v3base}/managedtransactions" \
    "{\"managedtransactions\":[{\"externaltransactionid\":\"${ext_id}-batch-a\",\"idcode\":\"${PASS_PREFIX}b1\",\"idtype\":0,\"checkindate\":\"${checkin}\",\"checkintype\":\"user\",\"sectionid\":\"${SECTION}\"},{\"externaltransactionid\":\"${ext_id}-batch-b\",\"idcode\":\"${PASS_PREFIX}b2\",\"idtype\":0,\"checkindate\":\"${checkin}\",\"checkintype\":\"user\",\"sectionid\":\"${SECTION}\"}]}" \
    "HTTP 200, status: 1, ids array"

  run_case "v3-04" "POST …/sections/{sec}/occupation (sync + occupation)" POST \
    "${v3base}/sections/${SECTION}/occupation" \
    "{\"data\":{\"transactiondate\":\"${ts}\",\"occupation\":2,\"intervalinminutes\":15,\"bikes\":[{\"idcode\":\"${PASS_PREFIX}occ\",\"idtype\":0,\"transactiondate\":\"${ts}\"}]}}" \
    "HTTP 200, status: 1"

  run_case "v3-05" "POST …/sections/{sec}/transactions" POST \
    "${v3base}/sections/${SECTION}/transactions" \
    "{\"transaction\":{\"type\":\"in\",\"transactiondate\":\"${ts}\",\"idcode\":\"${pass}\",\"idtype\":0}}" \
    "HTTP 200, status: 1"

  run_case "v3-06" "POST …/sections/{sec}/managedtransactions" POST \
    "${v3base}/sections/${SECTION}/managedtransactions" \
    "{\"managedtransaction\":{\"externaltransactionid\":\"${ext_id}-sec\",\"idcode\":\"${PASS_PREFIX}v3mt\",\"idtype\":0,\"checkindate\":\"${checkin}\",\"checkintype\":\"user\"}}" \
    "HTTP 200, status: 1"

  run_case "v3-07" "POST …/sections/{sec}/completedtransactions" POST \
    "${v3base}/sections/${SECTION}/completedtransactions" \
    "{\"completedtransaction\":{\"checkindate\":\"${checkin}\",\"checkoutdate\":\"${checkout}\",\"checkintype\":\"user\",\"typecheckout\":\"user\",\"price\":0}}" \
    "HTTP 200, status: 1"

  if [[ -n "$PLACE" ]]; then
    run_case "v3-08" "POST …/places/{place}/subscriptions" POST \
      "${v3base}/sections/${SECTION}/places/${PLACE}/subscriptions" \
      "{\"subscription\":{\"subscriptiontypeid\":${SUBSCRIPTION_TYPE_ID},\"idcode\":\"${PASS_PREFIX}v3psub\",\"cost\":0,\"startdate\":\"${ts}\"}}" \
      "HTTP 200, status: 1"

    run_case "v3-09" "POST …/places/{place}/transactions" POST \
      "${v3base}/sections/${SECTION}/places/${PLACE}/transactions" \
      "{\"transaction\":{\"type\":\"in\",\"transactiondate\":\"${ts}\",\"idcode\":\"${PASS_PREFIX}v3ptx\",\"idtype\":0}}" \
      "HTTP 200, status: 1"

    run_case "v3-10" "POST …/places/{place}/logs" POST \
      "${v3base}/sections/${SECTION}/places/${PLACE}/logs" \
      "{\"properties\":{\"type\":\"info\",\"description\":\"Manual test log ${RUN_ID}\",\"timestamp\":\"${ts}\"}}" \
      "HTTP 200, status: 1 (fmsservicelog row)"

    run_case "v3-11" "POST …/places/{place}/actions" POST \
      "${v3base}/sections/${SECTION}/places/${PLACE}/actions" \
      "{\"properties\":{\"action\":\"test\",\"actionid\":1,\"type\":\"info\",\"description\":\"Manual action ${RUN_ID}\"}}" \
      "HTTP 200, status: 1"

    run_case "v3-12" "PUT …/places/{place} — update place / locker" PUT \
      "${v3base}/sections/${SECTION}/places/${PLACE}" \
      "{\"properties\":{\"statuscode\":0,\"transactiondate\":\"${ts}\",\"name\":\"Test plek ${RUN_ID}\"}}" \
      "HTTP 200, status: 1"

    run_case "v3-13" "POST …/places/{place} — log via action property" POST \
      "${v3base}/sections/${SECTION}/places/${PLACE}" \
      "{\"properties\":{\"action\":\"manual-test\",\"type\":\"notice\",\"description\":\"POST place log ${RUN_ID}\"}}" \
      "HTTP 200, status: 1"
  else
    echo -e "${YELLOW}[v3-08 … v3-13 skipped] Set PLACE at setup for place-level tests.${NC}"
    SKIPPED=$((SKIPPED + 6))
    TOTAL=$((TOTAL + 6))
  fi

  echo
  echo -e "${YELLOW}Optional — koppelpas (requires existing temporary pass idtype 3 or 4 in DB):${NC}"
  read -r -p "Run koppelpas tests? [y/N]: " koppel
  if [[ "${koppel,,}" == "y" ]]; then
    read -r -p "Temporary idcode (without # for idtype 3): " tmp_id
    read -r -p "idtype (3=tijdelijk, 4=sleutelhanger): " tmp_type
    run_case "v3-14" "POST …/locations/{id}/idcodes/{type}/{code} — koppelpas" POST \
      "${v3base}/idcodes/${tmp_type}/${tmp_id}" \
      "{\"newidcodes\":{\"idcode\":\"${PASS_PREFIX}newpass\",\"idtype\":1}}" \
      "HTTP 200, status: 1 — only with valid temp pass in DB"

    if [[ -n "$PLACE" ]]; then
      run_case "v3-15" "POST …/sections/…/places/…/idcodes/… — koppelpas" POST \
        "${v3base}/sections/${SECTION}/places/${PLACE}/idcodes/${tmp_type}/${tmp_id}" \
        "{\"newidcodes\":{\"idcode\":\"${PASS_PREFIX}newpass2\",\"idtype\":1}}" \
        "HTTP 200, status: 1"
    fi
  fi
}

run_negative_smoke() {
  hr
  echo -e "${BOLD}Smoke — write API disabled?${NC}"
  echo "If ENABLE_WRITE_API is off, any write should return HTTP 403."
  read -r -p "Run 403 smoke test on saveJsonBike? [y/N]: " smoke
  if [[ "${smoke,,}" != "y" ]]; then
    return
  fi
  local url="${BASE_URL}/api/fms/v2/saveJsonBike/${BIKEPARK}"
  curl -sS -w "\nHTTP %{http_code}\n" -X POST \
    -H "Content-Type: application/json" \
    -H "$(auth_header)" \
    -d "{\"barcode\":\"x\",\"passID\":\"${PASS_PREFIX}smoke\"}" \
    "$url" || true
  echo "Expected: 403 when writes disabled, 200/400 when enabled."
  hr
}

summary() {
  hr
  echo -e "${BOLD}Summary${NC}"
  echo "  Total cases presented : $TOTAL"
  echo -e "  ${GREEN}Passed${NC}                : $PASSED"
  echo -e "  ${RED}Failed${NC}                : $FAILED"
  echo -e "  ${YELLOW}Skipped${NC}               : $SKIPPED"
  echo "  Pass prefix used        : ${PASS_PREFIX}*"
  hr
  echo "After testing, verify side effects in admin / DB if needed."
  echo "Synthetic pass IDs use prefix ${PASS_PREFIX} — easy to find and clean up."
}

main() {
  echo -e "${BOLD}FMS API v2/v3 — manual write test script${NC}"
  require_pass
  setup_scope

  echo
  echo "Choose sections to walk through:"
  echo "  1) v2 only"
  echo "  2) v3 only"
  echo "  3) v2 then v3 (full run)"
  echo "  4) pick individual ranges"
  choice="$(prompt "Choice" "3")"

  case "$choice" in
    1) run_v2_tests ;;
    2) run_v3_tests ;;
    3) run_v2_tests; run_v3_tests ;;
    *)
      read -r -p "Run v2? [Y/n]: " do_v2
      read -r -p "Run v3? [Y/n]: " do_v3
      [[ "${do_v2:-Y}" != [nN]* ]] && run_v2_tests
      [[ "${do_v3:-Y}" != [nN]* ]] && run_v3_tests
      ;;
  esac

  run_negative_smoke
  summary
}

main "$@"
