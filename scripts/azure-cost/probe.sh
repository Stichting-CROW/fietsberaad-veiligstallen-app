#!/usr/bin/env bash
# Read-only check against every enabled subscription of the current portal user.
# Does not create, update, or delete anything.
set -u
source "$(dirname "$0")/lib.sh"

root="$(azure_cost_root)"
raw="$root/data/azure-costs/raw"
mkdir -p "$raw"
log="$root/data/azure-costs/probe-log.txt"
: >"$log"

azure_cost_require_login | tee -a "$log"

run_json() {
  local dest_dir="$1"
  local name="$2"
  shift 2
  local dest="$dest_dir/${name}.json"
  local err
  err="$(mktemp)"
  echo "=== $name ===" | tee -a "$log"
  if "$@" -o json >"$dest" 2>"$err"; then
    echo "ok $name" | tee -a "$log"
  else
    echo "FAILED $name" | tee -a "$log"
    cat "$err" | tee -a "$log"
    node -e '
      const fs = require("fs");
      const dest = process.argv[1];
      const errFile = process.argv[2];
      const error = fs.readFileSync(errFile, "utf8");
      fs.writeFileSync(dest, JSON.stringify({ error }, null, 2));
    ' "$dest" "$err"
  fi
  rm -f "$err"
}

probe_subscription() {
  local name="$1"
  local sub="$2"
  local slug
  slug="$(azure_cost_env "$name")"
  local dest="$raw/$slug"
  mkdir -p "$dest"
  echo "=== subscription $name ($slug) ===" | tee -a "$log"
  run_json "$dest" groups az group list --subscription "$sub"
  run_json "$dest" resources az resource list --subscription "$sub"
  run_json "$dest" webapps az webapp list --subscription "$sub"
  run_json "$dest" plans az appservice plan list --subscription "$sub"
  run_json "$dest" mysql az mysql flexible-server list --subscription "$sub"

  local exports_err
  exports_err="$(mktemp)"
  echo "=== exports ===" | tee -a "$log"
  if az rest --method get \
    --url "https://management.azure.com/subscriptions/${sub}/providers/Microsoft.CostManagement/exports?api-version=2023-11-01" \
    -o json >"$dest/exports.json" 2>"$exports_err"; then
    echo "ok exports" | tee -a "$log"
  else
    echo "FAILED exports" | tee -a "$log"
    cat "$exports_err" | tee -a "$log"
    node -e '
      const fs = require("fs");
      fs.writeFileSync(process.argv[1], JSON.stringify({ error: fs.readFileSync(process.argv[2], "utf8") }, null, 2));
    ' "$dest/exports.json" "$exports_err"
  fi
  rm -f "$exports_err"

  local prev
  prev="$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m)"
  local groups=()
  mapfile -t groups < <(az group list --subscription "$sub" --query "[].name" -o tsv)
  if [[ "${#groups[@]}" -eq 0 ]]; then
    echo "=== cost $prev (subscription) ===" | tee -a "$log"
    query_usage_month "$prev" "$root" "$sub" "$slug" "$name" | tee -a "$log"
    echo "=== cost 2024-01 (subscription) ===" | tee -a "$log"
    query_usage_month "2024-01" "$root" "$sub" "$slug" "$name" | tee -a "$log"
    return
  fi
  local rg
  for rg in "${groups[@]}"; do
    echo "=== cost $prev $rg ===" | tee -a "$log"
    query_usage_month "$prev" "$root" "$sub" "$slug" "$name" "$rg" | tee -a "$log"
    echo "=== cost 2024-01 $rg ===" | tee -a "$log"
    query_usage_month "2024-01" "$root" "$sub" "$slug" "$name" "$rg" | tee -a "$log"
  done
}

while IFS=$'\t' read -r name sub; do
  [[ -z "$name" ]] && continue
  azure_cost_want "$(azure_cost_env "$name")" || continue
  probe_subscription "$name" "$sub"
done < <(az account list --query "[?state=='Enabled'].[name,id]" -o tsv)

echo "Probe log: $log"
echo "If a cost file has status denied, export CSVs from Cost Management in the portal into data/azure-costs/raw/portal/"
