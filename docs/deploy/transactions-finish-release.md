# Release experiments/transactions-finish

Deploy notes for the release that brings `experiments/transactions-finish` to acceptance and then to production
(PR `acceptance` → `main`; the production workflow deploys from `main`).

Database changes are not a Prisma migration. They are in
[transactions-finish-release.sql](transactions-finish-release.sql), run by hand in MySQL Workbench.

Contents:

- [What the release contains](#what-the-release-contains)
- [The SQL script](#the-sql-script)
- [Acceptance (done 2026-11-06)](#acceptance-done-2026-11-06)
- [Production: before the PR acceptance → main](#production-before-the-pr-acceptance--main)
- [Production: the deploy](#production-the-deploy)
- [Production: after the deploy](#production-after-the-deploy)
- [Rollback](#rollback)
- [Known issues](#known-issues)

## What the release contains

- FMS v4 managed transactions: queue `new_wachtrij_managed_transacties`, archive rows keyed by `transacties.ID`,
  batch limit 500 per request.
- Background tasks with a scheduler (`background_schedules`, `background_tasks`, `background_settings`) and the
  beheer screen **Beheer → Achtergrondprocessen**.
- Privacy retention job with a run log (`privacy_retention_runs`, `privacy_retention_actions`). The SQL comes from
  ColdFusion `remote/cronjobs/privacy.cfm`.
- Parkeersimulatie removed (tables `parkingsimulation_*` dropped).
- Hotfix `report-data-owner`: reports only show stallingen of the active data owner.
- OpenAPI v4 docs (FMS and reporting), Wilmar handleiding.
- Cron endpoints for the jobs below, and GitHub workflows that call them on production.

## The SQL script

Idempotent: every change checks `information_schema` first, so running it twice is safe. It stops with an error on a
wrong or unselected schema, and when a view is missing.

| Section | What | Notes |
|---|---|---|
| 1 | Pre-checks | Shows database, version, user, and which tables exist. |
| 2 | `privacy_retention_*`, `background_*`, row `claim_lock` | Same DDL as the app's `CREATE TABLE IF NOT EXISTS`. |
| 3 | `financialtransactions.mollieTransactionID` to `VARCHAR(32)` | Only when narrower. ColdFusion maps it as length 20; widening does not affect ColdFusion. |
| 4 | Indexes | `idx_bikeparkID_source_interval_timestamp` on `bezettingsdata_day_hour_cache` (bezetting report). The six `idx_*cache_*` indexes (cache rebuilds). All `ALGORITHM=INPLACE, LOCK=NONE`. |
| 5 | `transacties_archief.externaltransactionid` cleanup | Only on a database that ran the reverted migration. Deletes `source='fms-v4-managed'` rows from that period, then drops the indexes and the column. |
| 6 | Drop `parkingsimulation_*` | Feature removed. |
| 7 | Views | Checks the 7 views from [prisma/sql/mysql-views.sql](../../prisma/sql/mysql-views.sql). Does not recreate them. A `MISSING` view must be created from that file. |
| — | Post-check | 11 rows; every row must say `ok`. |

Workbench settings:

1. Double-click the target schema so it is the default schema.
2. Keep **Stop Script Execution on Errors** on.
3. **Edit → Preferences → SQL Editor** (the parent node, not its sub-pages), section **MySQL Session**:
   **DBMS connection read time out** to `3600` (`0` = no limit). Then **Query → Reconnect to Server**.

If Workbench drops the connection during section 4 (error 2013), the `ALTER TABLE` keeps running on the server.
Wait until it is gone from `SHOW PROCESSLIST;`, then run the script again.

## Acceptance (done 2026-11-06)

Database: Azure MySQL `8.0.46`, schema `veiligstallen`.

Read-only inspection before the run:

- Missing: `privacy_retention_*`, `background_*`, index `idx_bikeparkID_source_interval_timestamp`
  (`bezettingsdata_day_hour_cache`: 5.3M rows, 1.8 GB).
- Present: `parkingsimulation_*` (bicycles 135 rows).
- Already correct: `mollieTransactionID` `varchar(32)`, the six cache indexes, no `externaltransactionid`,
  0 `fms-v4-managed` archive rows, all 7 views identical to `mysql-views.sql` (DEFINER `crowvst_admin@%`).
- Sizes: `transacties_archief` 34M rows (15 GB), `bezettingsdata` 22M rows (12 GB).
- `sql_mode` has no `ONLY_FULL_GROUP_BY` (see [Known issues](#known-issues)).

Run result: all 11 post-checks `ok`.

Workflow changes (`.github/workflows/azure-webapps-node-acceptance.yml`):

- Removed `echo "NODE_ENV=acceptance >>" .env`. It never wrote anything (the `>>` was inside the quotes), and a
  fixed line would not work either: `next build` and `next start` set `NODE_ENV=production` before they read `.env`,
  and `.env` does not override variables that are already set.
- Added `NEXT_PUBLIC_APP_ENV=acceptance` and `NEXT_PUBLIC_SITE_URL=https://vstfb-eu-acc-app01.azurewebsites.net`.
  `NEXT_PUBLIC_*` values are inlined at build time, so they must be in the build's `.env`.
- Added `BACKGROUND_INTERNAL_TICK=true`: the app runs the scheduler every minute itself. Next copies `.env` into
  `build/standalone`, so the value is there at runtime.
- Commented out the `cat .env` step. `ACC_DATABASE_URL` and `ACC_NEXTAUTH_SECRET` are GitHub **vars**, not secrets,
  so the step printed them unmasked in every run log.

After the deploy on acceptance:

- All background schedules start disabled (see [Background schedules](#background-schedules)). Enable
  *Wachtrij verwerken (FMS)* in **Beheer → Achtergrondprocessen**. Keep `abonnementen` and `bulkreserveringen` off
  while ColdFusion acceptance runs them.
- Still to do: move `ACC_DATABASE_URL` and `ACC_NEXTAUTH_SECRET` to secrets and rotate them.

## Production: before the PR acceptance → main

### 1. Inspect the production database (read-only)

The acceptance findings do not carry over. Run section 1 of the script on its own, and these queries:

```sql
SELECT VERSION(), @@GLOBAL.sql_mode;

SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 / 1024, 1) AS gb
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('bezettingsdata_day_hour_cache', 'bezettingsdata', 'transacties_archief', 'financialtransactions')
   OR (TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'parkingsimulation\_%');

SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND (INDEX_NAME LIKE 'idx\_%cache\_%' OR INDEX_NAME = 'idx_bikeparkID_source_interval_timestamp'
       OR INDEX_NAME IN ('uk_archief_location_external_tx', 'idx_archief_externaltransactionid'))
GROUP BY TABLE_NAME, INDEX_NAME;

SELECT COLUMN_TYPE, COLLATION_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financialtransactions' AND COLUMN_NAME = 'mollieTransactionID';

SELECT TABLE_NAME, DEFINER, SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE();
```

Check:

- Every index the script would add: plan the run outside office hours. The six `idx_*cache_*` indexes are on
  `bezettingsdata` and `transacties_archief`, which are far larger than the cache table. Each needs free disk of
  roughly the index size during the build.
- `mollieTransactionID`: if narrower than 32 and its collation differs from the table default, the `MODIFY` changes
  the collation and may rebuild the table. Decide before the run.
- `parkingsimulation_*`: confirm the rows may go (they were test data on acceptance).
- Views: all 7 must exist. If one differs from `mysql-views.sql`, compare it before changing anything; the script
  does not touch views.
- `sql_mode` with `ONLY_FULL_GROUP_BY`: `vw_stallingstegoedenexploitant` fails then (see [Known issues](#known-issues)).

### 2. Production workflow changes (part of the PR)

`.github/workflows/azure-webapps-node-production.yml` still has the old problems. Change it in the PR:

- Remove `echo "NODE_ENV=production >>" .env` (same reason as on acceptance).
- Add `echo "NEXT_PUBLIC_APP_ENV=production" >> .env`. **Required.** Code that must behave differently on production
  checks this value, and it is not set today:
  - privacy retention: off production, write runs from the beheer screen are allowed without
    `PRIVACY_RETENTION_WRITES`;
  - robots/SEO (index vs noindex);
  - the test-env guards refuse production on this value.
- Add `echo "NEXT_PUBLIC_SITE_URL=https://beta.veiligstallen.nl" >> .env` (or the final production URL). Used for
  mail links, sitemap, Open Graph tags.
- Add `CRON_SECRET` to the env block and `echo "CRON_SECRET=$CRON_SECRET" >> .env`, from the same secret the job
  workflows use (`secrets.CRON_SECRET` in environment `production`). **Required.** The cron endpoints only check
  the token when `CRON_SECRET` is set; without it anyone can call them. Unless it is set in the Azure App Settings,
  this is already the case for `/api/cron/process-queues` and `/api/cron/contactpersonen-reminders` on production
  today.
- Comment out the `cat .env` step. `PROD_DATABASE_URL` and `PROD_NEXTAUTH_SECRET` are vars, so production
  credentials are in the old run logs. Move them to secrets, rotate them, and delete the old logs if possible.
- Do **not** add: `ENABLE_WRITE_API`, `BACKGROUND_INTERNAL_TICK` (ColdFusion still processes the production
  queues), `TEST_ENV_BOOTSTRAP`, `TEST_DATA_EIGENAAR_BOOTSTRAP`, `PRIVACY_RETENTION_WRITES` (only after the privacy
  rehearsal is signed off), `BUURTSTALLINGEN_ENGINE_SITE_IDS`, `OVERBOEKEN_CRON_ENABLED`.

### 3. Scheduled job workflows

These workflows exist on this branch, not on `main`. GitHub runs scheduled workflows from the default branch
(`main`), so they start calling **production** as soon as the PR is merged:

| Workflow | Schedule | Calls | Effect on production |
|---|---|---|---|
| `abonnementen-job.yml` | daily 03:30 NL | `/api/cron/abonnementen` | Expires subscriptions, sends warnings. |
| `bulkreserveringen-job.yml` | daily | `/api/cron/bulkreserveringen` | Rolls recurring bulk reservations forward. |
| `buurtstallingen-jobs.yml` | every 5 minutes | buurtstallingen jobs | No-op while `BUURTSTALLINGEN_ENGINE_SITE_IDS` is unset. |
| `ns-locations-job.yml` | daily | `/api/cron/ns-locations` | NS location sync. |
| `overboeken-job.yml` | daily | `/api/cron/overboeken` | No-op while `OVERBOEKEN_CRON_ENABLED` is not `1`. |
| `transacties-gemeente-totaal.yml` | daily | `/api/cron/transacties-gemeente-totaal` | Report totals. |
| `update-report-caches-production.yml` | daily | cache update | Already on `main`. |
| `info-files-job.yml`, `privacy-retention.yml` | manual only | | |

Decide per workflow whether production should run it while ColdFusion still does the same job. For the ones that
must wait, remove the `schedule:` block (keep `workflow_dispatch`) or disable the workflow in GitHub
(**Actions → workflow → Disable workflow**) before the merge.

## Production: the deploy

1. Run [transactions-finish-release.sql](transactions-finish-release.sql) on the production database in Workbench.
   All changes are compatible with the code that is on production now. Exception: the old parkeersimulatie pages
   fail once their tables are gone.
2. Check that all 11 post-check rows are `ok`.
3. Merge the PR `acceptance` → `main`.
4. Check the deploy run: `gh run list --workflow azure-webapps-node-production.yml`.

## Production: after the deploy

### Background schedules

Schedules are seeded once (`INSERT IGNORE`) and every deployed build seeds them **disabled**
(`scheduleDefaults()` in `src/server/background/registry.ts`; only `next dev` uses the per-task defaults).
Edits on **Beheer → Achtergrondprocessen** are kept. Without `BACKGROUND_INTERNAL_TICK` the scheduler only runs when
something calls `/api/cron/tick`, which nothing does on production.

Keep *Wachtrij verwerken (FMS)* off on production while ColdFusion processes the production queues.

### Smoke tests

- Homepage, beheer login, `/docs/api/v4`.
- Reports: only stallingen of the active data owner.
- **Beheer → Achtergrondprocessen** opens; all schedules disabled.
- Privacy screen shows environment `production`, and write runs are refused without `PRIVACY_RETENTION_WRITES`.
- `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://beta.veiligstallen.nl/api/cron/tick` returns `401`.
  `503` means `CRON_SECRET` is not configured and the other cron endpoints are open. Without a token `tick` returns
  before it runs anything, so this check is safe.
- Citizen balance on `/account` (views `vw_stallingstegoeden`, `vw_stallingstegoedenexploitant`).
- `robots.txt` allows indexing.

## Rollback

The database changes are additive except two: the `parkingsimulation_*` tables are dropped (back up first if the
rows matter), and the Mollie column may be widened. The previous code runs against the new schema; redeploy the
previous `main` commit.

## Known issues

- Docker MySQL 8.4 has `ONLY_FULL_GROUP_BY` in `sql_mode`; Azure does not. Under that mode
  `vw_stallingstegoedenexploitant` fails (error 1055 on `paidToSiteID`), so the exploitant balance and overboeken
  fail in the docker environment. Fix in the docker `sql_mode` or with `ANY_VALUE()` in the view.
- The section-level koppelpas route (`…/sections/{sectionid}/idcodes/…`) is an alias: `sectionid` is ignored, as in v3.
