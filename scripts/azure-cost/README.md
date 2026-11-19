# Azure cost snapshots

Read-only export of Azure costs, plus the superadmin page **Azure-kosten** in beheer. The Next.js app never calls Azure. It only reads `data/azure-costs/summary.json`.

## Where the data goes

Everything collected stays in `data/azure-costs/`. That path is listed in `.gitignore` (`/data/azure-costs/`). Do not `git add -f` it. Resource names, plan ids, and amounts must not be committed. Deployed sites do not receive this folder through git. Open the page from a checkout that has the snapshot.

| Path | What it is |
| --- | --- |
| `data/azure-costs/raw/prod/` | Production inventory, monthly cost files, and meter files |
| `data/azure-costs/raw/acc/` | Acceptance inventory and monthly cost files |
| `data/azure-costs/raw/portal/` | Optional portal CSVs when the API denies the query. Name them `prod.csv` and `acc.csv` |
| `data/azure-costs/classification.json` | Local category rules. Copy from `classification.example.json` |
| `data/azure-costs/job-catalog.json` | Local notes for scheduled tasks |
| `data/azure-costs/evidence/` | Optional live evidence for the task table |
| `data/azure-costs/summary.json` | Built file the page reads |
| `data/azure-costs/probe-log.txt` | Log from `probe.sh` |

A month file is `usage-YYYY-MM.json`, or `usage-YYYY-MM--<resource-group>.json` when the query is scoped to a resource group. A file with `"status": "ok"` is kept. The export skips it on the next run.

## Scripts

Run them from the repository root. Helpers `lib.sh`, `wrap-query.mjs`, `split-range.mjs`, and `next-link.mjs` are used by the shell scripts. You do not run those yourself.

| Script | Purpose |
| --- | --- |
| `scripts/azure-cost/probe.sh` | Check the login, write the inventory, and fetch two cost months (previous month and 2024-01) |
| `scripts/azure-cost/export-costs.sh` | Fetch costs from 2024-01 through the current month. One query per 11-month window for `vst-eu-prd-rg01` and `vst-eu-acc-rg01` |
| `scripts/azure-cost/export-meters.sh` | Production only. Fetch MySQL and App Service meters (compute, storage, backup, I/O) |
| `scripts/azure-cost/build-summary.mjs` | Turn the raw files and `classification.json` into `summary.json` |
| `scripts/azure-cost/classification.example.json` | Empty example for the category rules |

`AZURE_COST_ENV=prod` or `AZURE_COST_ENV=acc` limits `probe.sh` and `export-costs.sh` to that subscription.

## How to collect

1. Log in as the same user as the Azure portal.

```bash
az login
```

Do not run `azure/az-login.sh` first. That switches the session to the service principal, which only manages one web app. The scripts stop when the current login is a service principal.

2. Check access and write the inventory.

```bash
bash scripts/azure-cost/probe.sh
```

Cost queries use the resource group, not the subscription. A subscription-scope query is denied for this login. If a cost file has `"status": "denied"`, download one Cost analysis CSV per subscription and save them as `data/azure-costs/raw/portal/prod.csv` and `data/azure-costs/raw/portal/acc.csv`.

3. Fetch the remaining months.

```bash
bash scripts/azure-cost/export-costs.sh
```

Each call is `az rest --method post` to the Cost Management query API. It does not change Azure. A window uses `"granularity": "Monthly"` over at most 11 months, grouped by resource id and service name. The response is split into the existing `usage-YYYY-MM--<resource-group>.json` files. A month the window does not return is requested on its own. The script waits between calls because the API returns 429 after a short burst. A month outside retention is saved with `"status": "unavailable"`. History is often about 13 months, and a range longer than a year is rejected, so the export stays inside 11-month windows.

4. Fetch the production meter split. This is a separate query. The website still does not call Azure.

```bash
bash scripts/azure-cost/export-meters.sh
```

Scope is `vst-eu-prd-rg01`. The query is monthly actual cost, grouped by resource id and meter subcategory, filtered to Azure Database for MySQL and Azure App Service. Files are `meters-<from>_<to>--<resource-group>.json` under `data/azure-costs/raw/prod/`. A file with `"status": "ok"` is skipped on the next run. The Opbouw tab adds every production MySQL server together. Meter names that contain compute, storage, backup, or I/O are mapped onto those columns. Any other meter keeps its Azure name in the meter table. App Service is not shown there.

5. Add category rules, if the file is not there yet.

```bash
cp scripts/azure-cost/classification.example.json data/azure-costs/classification.json
```

Each rule is a name fragment (`match`) plus `environment` (`prod` or `acc`) and `platform` (`core`, `api`, `database`, `network`, or `other`). The longest matching fragment wins. Bandwidth charges are stored as `network` when the summary is built.

6. Build the file the page reads.

```bash
node scripts/azure-cost/build-summary.mjs
```

Reload **Azure-kosten**. The API is `GET /api/protected/azure-costs` and it only serves `summary.json`.

To refresh later, run `export-costs.sh`, `export-meters.sh`, and `build-summary.mjs` again. Files that already have `"status": "ok"` are not downloaded again.

## Tasks on the Detail tab

`job-catalog.json` is optional and gitignored. `build-summary.mjs` joins it to the local scheduler sources when those files exist. The column **Gezien** stays empty until one of these evidence files is present:

- `data/azure-costs/evidence/logic-apps.json`
- `data/azure-costs/evidence/scheduler.xml`
- `data/azure-costs/evidence/requests.json` with `{ "urls": ["https://host/.../job.cfm"] }`

Savings choices on the page (the plan ratio and which services stop) are stored in the browser, not in these files.
