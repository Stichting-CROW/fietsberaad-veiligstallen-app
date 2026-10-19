#!/usr/bin/env bash
# Read-only monthly cost export from 2024-01 through the current month,
# for every enabled subscription of the current portal user.
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
  if [[ "${#groups[@]}" -eq 0 ]]; then
    echo "No resource groups in $name"
    continue
  fi
  month="$start"
  while [[ "$month" < "$end" || "$month" == "$end" ]]; do
    for rg in "${groups[@]}"; do
      echo "Fetching $slug $month $rg"
      query_usage_month "$month" "$root" "$sub" "$slug" "$name" "$rg" || echo "Failed to write $slug $month $rg"
    done
    month="$(date -d "${month}-01 +1 month" +%Y-%m)"
  done
done < <(az account list --query "[?state=='Enabled'].[name,id]" -o tsv)

echo "Next: node scripts/azure-cost/build-summary.mjs"
