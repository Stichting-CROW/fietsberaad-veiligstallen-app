#!/usr/bin/env bash
# Read-only production meter export for MySQL and App Service.
# The website cannot call Azure. Run this with the portal login, then build-summary.mjs.
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
  [[ "$slug" == "prod" ]] || continue
  echo "Subscription $name ($slug)"
  mapfile -t groups < <(az group list --subscription "$sub" --query "[].name" -o tsv)
  from="$start"
  while [[ "$from" < "$end" || "$from" == "$end" ]]; do
    to="$(date -d "${from}-01 +10 months" +%Y-%m)"
    if [[ "$to" > "$end" ]]; then
      to="$end"
    fi
    rg="vst-eu-prd-rg01"
    if ! printf '%s\n' "${groups[@]}" | grep -qx "$rg"; then
      echo "Resource group $rg not in $name"
    else
      query_meters "$from" "$to" "$root" "$sub" "$slug" "$name" "$rg" || echo "Failed meters $from $rg"
    fi
    from="$(date -d "${to}-01 +1 month" +%Y-%m)"
  done
done < <(az account list --query "[?state=='Enabled'].[name,id]" -o tsv)

echo "Next: node scripts/azure-cost/build-summary.mjs"
