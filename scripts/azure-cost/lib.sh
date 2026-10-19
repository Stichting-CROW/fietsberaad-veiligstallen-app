# Shared helpers for the read-only Azure cost scripts.
# shellcheck shell=bash

azure_cost_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

azure_cost_require_login() {
  if ! az account show -o none 2>/dev/null; then
    echo "Not logged in. Run: az login" >&2
    echo "Use the same account as the Azure portal. Do not run azure/az-login.sh first; that switches to the service principal." >&2
    exit 1
  fi
  local user_type
  user_type="$(az account show --query user.type -o tsv)"
  if [[ "$user_type" != "user" ]]; then
    echo "The current az login is a ${user_type}, not the portal user." >&2
    echo "Run: az login" >&2
    echo "Do not run azure/az-login.sh before these scripts." >&2
    exit 1
  fi
  echo "Portal user: $(az account show --query user.name -o tsv)"
  echo "Subscriptions:"
  az account list --query "[?state=='Enabled'].name" -o tsv
}

# AZURE_COST_ENV=prod or acc limits a run to one subscription.
azure_cost_want() {
  local slug="$1"
  if [[ -z "${AZURE_COST_ENV:-}" ]]; then
    return 0
  fi
  [[ "$slug" == "$AZURE_COST_ENV" ]]
}

# prod or acc, from the subscription display name. Anything else stays "other".
azure_cost_env() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  if [[ "$name" == *acceptance* || "$name" == *acceptatie* ]]; then
    echo acc
  elif [[ "$name" == *production* || "$name" == *productie* ]]; then
    echo prod
  else
    echo other
  fi
}

# Writes data/azure-costs/raw/<prod|acc>/usage-YYYY-MM.json
# Uses az rest POST against the Cost Management query API. That call only reads costs.
query_usage_month() {
  local month="$1"
  local root="$2"
  local sub="$3"
  local env_slug="$4"
  local subscription_name="$5"
  local resource_group="${6:-}"
  local raw="$root/data/azure-costs/raw/${env_slug}"
  local out="$raw/usage-${month}.json"
  if [[ -n "$resource_group" ]]; then
    out="$raw/usage-${month}--${resource_group}.json"
  fi
  mkdir -p "$raw"
  if [[ -f "$out" ]]; then
    local existing_status
    existing_status="$(node -e 'const fs=require("fs"); try { process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).status || "") } catch { process.stdout.write("") }' "$out")"
    if [[ "$existing_status" == "ok" ]]; then
      echo "Skip $out"
      return 0
    fi
  fi
  local work
  work="$(mktemp -d)"
  local from="${month}-01T00:00:00Z"
  local to
  to="$(date -u -d "${month}-01 +1 month" +%Y-%m-%dT00:00:00Z)"
  local body="$work/body.json"
  cat >"$body" <<EOF
{"type":"ActualCost","timeframe":"Custom","timePeriod":{"from":"${from}","to":"${to}"},"dataset":{"granularity":"None","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ResourceId"},{"type":"Dimension","name":"ServiceName"}]}}
EOF

  local url="https://management.azure.com/subscriptions/${sub}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
  if [[ -n "$resource_group" ]]; then
    url="https://management.azure.com/subscriptions/${sub}/resourceGroups/${resource_group}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
  fi
  local page=0
  local failed=0
  while [[ -n "$url" && "$page" -lt 20 ]]; do
    local err="$work/err-${page}.txt"
    local dest="$work/page-${page}.json"
    local try=0
    local ok_call=0
    while [[ "$try" -lt 6 ]]; do
      if az rest --method post --url "$url" --body @"$body" -o json >"$dest" 2>"$err"; then
        ok_call=1
        break
      fi
      if grep -q "429" "$err"; then
        try=$((try + 1))
        echo "Rate limited, waiting $((20 * try))s" >&2
        sleep $((20 * try))
        continue
      fi
      break
    done
    if [[ "$ok_call" -ne 1 ]]; then
      failed=1
      break
    fi
    url="$(node "$root/scripts/azure-cost/next-link.mjs" "$dest")"
    page=$((page + 1))
    sleep 8
  done

  if [[ "$failed" -eq 1 ]]; then
    node "$root/scripts/azure-cost/wrap-query.mjs" "$month" fail "$work" "$out" "$env_slug" "$subscription_name"
  else
    node "$root/scripts/azure-cost/wrap-query.mjs" "$month" ok "$work" "$out" "$env_slug" "$subscription_name"
  fi
  rm -rf "$work"
  echo "Wrote $out"
}
