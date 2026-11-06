#!/usr/bin/env bash
# Read-only cost export from 2024-01 through the current month.
# One monthly-granularity query covers up to 11 months per resource group.
# Months the window does not return are fetched one by one.
# Months outside retention are stored with status unavailable, not skipped silently.
set -u
source "$(dirname "$0")/lib.sh"

root="$(azure_cost_root)"
mkdir -p "$root/data/azure-costs/raw"
azure_cost_require_login

start="2024-01"
end="$(date +%Y-%m)"

while IFS=$'\t' read -r name sub; do
  [[ -z "$name" ]] && continue
  slug="$(azure_cost_env "$name")"
  azure_cost_want "$slug" || continue
  echo "Subscription $name ($slug)"
  mapfile -t groups < <(az group list --subscription "$sub" --query "[].name" -o tsv)
  from="$start"
  while [[ "$from" < "$end" || "$from" == "$end" ]]; do
    to="$(date -d "${from}-01 +10 months" +%Y-%m)"
    if [[ "$to" > "$end" ]]; then
      to="$end"
    fi
    for rg in vst-eu-prd-rg01 vst-eu-acc-rg01; do
      if ! printf '%s\n' "${groups[@]}" | grep -qx "$rg"; then
        continue
      fi
      query_usage_window "$from" "$to" "$root" "$sub" "$slug" "$name" "$rg" || echo "Failed window $slug $from $rg"
    done
    from="$(date -d "${to}-01 +1 month" +%Y-%m)"
  done
done < <(az account list --query "[?state=='Enabled'].[name,id]" -o tsv)

echo "Next: bash scripts/azure-cost/export-meters.sh && node scripts/azure-cost/build-summary.mjs"
