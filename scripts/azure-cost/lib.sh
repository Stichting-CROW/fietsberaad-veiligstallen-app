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

usage_file_ok() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  local existing_status
  existing_status="$(node -e 'const fs=require("fs"); try { process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).status || "") } catch { process.stdout.write("") }' "$file")"
  [[ "$existing_status" == "ok" ]]
}

# POST a Cost Management query and follow nextLink. Pages land in the work directory.
azure_cost_post() {
  local url="$1"
  local body="$2"
  local work="$3"
  local root="$4"
  local page=0
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
      return 1
    fi
    url="$(node "$root/scripts/azure-cost/next-link.mjs" "$dest")"
    page=$((page + 1))
    sleep 8
  done
  return 0
}

cost_query_url() {
  local sub="$1"
  local resource_group="${2:-}"
  if [[ -n "$resource_group" ]]; then
    echo "https://management.azure.com/subscriptions/${sub}/resourceGroups/${resource_group}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
  else
    echo "https://management.azure.com/subscriptions/${sub}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
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
  if usage_file_ok "$out"; then
    echo "Skip $out"
    return 0
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
  local url
  url="$(cost_query_url "$sub" "$resource_group")"
  if azure_cost_post "$url" "$body" "$work" "$root"; then
    node "$root/scripts/azure-cost/wrap-query.mjs" "$month" ok "$work" "$out" "$env_slug" "$subscription_name"
  else
    node "$root/scripts/azure-cost/wrap-query.mjs" "$month" fail "$work" "$out" "$env_slug" "$subscription_name"
  fi
  rm -rf "$work"
  echo "Wrote $out"
}

# One monthly-granularity query for up to 11 months. Splits the result into the per-month files.
# Months the API does not return are fetched one by one.
query_usage_window() {
  local from_month="$1"
  local to_month="$2"
  local root="$3"
  local sub="$4"
  local env_slug="$5"
  local subscription_name="$6"
  local resource_group="${7:-}"
  local raw="$root/data/azure-costs/raw/${env_slug}"
  mkdir -p "$raw"
  local pending=0
  local month="$from_month"
  while [[ "$month" < "$to_month" || "$month" == "$to_month" ]]; do
    local out="$raw/usage-${month}.json"
    if [[ -n "$resource_group" ]]; then
      out="$raw/usage-${month}--${resource_group}.json"
    fi
    if ! usage_file_ok "$out"; then
      pending=1
      break
    fi
    month="$(date -d "${month}-01 +1 month" +%Y-%m)"
  done
  if [[ "$pending" -eq 0 ]]; then
    echo "Skip $env_slug $from_month..$to_month ${resource_group:-subscription}"
    return 0
  fi
  local work
  work="$(mktemp -d)"
  local from="${from_month}-01T00:00:00Z"
  local to
  to="$(date -u -d "${to_month}-01 +1 month" +%Y-%m-%dT00:00:00Z)"
  local body="$work/body.json"
  cat >"$body" <<EOF
{"type":"ActualCost","timeframe":"Custom","timePeriod":{"from":"${from}","to":"${to}"},"dataset":{"granularity":"Monthly","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ResourceId"},{"type":"Dimension","name":"ServiceName"}]}}
EOF
  local url
  url="$(cost_query_url "$sub" "$resource_group")"
  echo "Window $env_slug $from_month..$to_month ${resource_group:-subscription}"
  if azure_cost_post "$url" "$body" "$work" "$root"; then
    node "$root/scripts/azure-cost/split-range.mjs" "$work" "$raw" "$resource_group" "$env_slug" "$subscription_name"
  else
    echo "Window failed, falling back to single months" >&2
  fi
  rm -rf "$work"
  month="$from_month"
  while [[ "$month" < "$to_month" || "$month" == "$to_month" ]]; do
    query_usage_month "$month" "$root" "$sub" "$env_slug" "$subscription_name" "$resource_group" || echo "Failed $env_slug $month $resource_group"
    month="$(date -d "${month}-01 +1 month" +%Y-%m)"
  done
}

# Production meter split for MySQL and App Service. Manual az only.
query_meters() {
  local from_month="$1"
  local to_month="$2"
  local root="$3"
  local sub="$4"
  local env_slug="$5"
  local subscription_name="$6"
  local resource_group="$7"
  local raw="$root/data/azure-costs/raw/${env_slug}"
  local out="$raw/meters-${from_month}_${to_month}--${resource_group}.json"
  mkdir -p "$raw"
  if usage_file_ok "$out"; then
    echo "Skip $out"
    return 0
  fi
  local work
  work="$(mktemp -d)"
  local from="${from_month}-01T00:00:00Z"
  local to
  to="$(date -u -d "${to_month}-01 +1 month" +%Y-%m-%dT00:00:00Z)"
  local body="$work/body.json"
  cat >"$body" <<EOF
{"type":"ActualCost","timeframe":"Custom","timePeriod":{"from":"${from}","to":"${to}"},"dataset":{"granularity":"Monthly","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ResourceId"},{"type":"Dimension","name":"MeterSubcategory"}],"filter":{"dimensions":{"name":"ServiceName","operator":"In","values":["Azure Database for MySQL","Azure App Service"]}}}}
EOF
  local url
  url="$(cost_query_url "$sub" "$resource_group")"
  echo "Meters $env_slug $from_month..$to_month $resource_group"
  if azure_cost_post "$url" "$body" "$work" "$root"; then
    node "$root/scripts/azure-cost/wrap-query.mjs" "${from_month}_${to_month}" ok "$work" "$out" "$env_slug" "$subscription_name"
  else
    node "$root/scripts/azure-cost/wrap-query.mjs" "${from_month}_${to_month}" fail "$work" "$out" "$env_slug" "$subscription_name"
  fi
  rm -rf "$work"
  echo "Wrote $out"
}
