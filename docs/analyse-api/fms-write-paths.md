# FMS write paths (v4 / Next.js vs v2/v3 / ColdFusion)

Current write split. Read `fields` behaviour stays in [fms-v3-fields-query-werkelijk-gedrag.md](fms-v3-fields-query-werkelijk-gedrag.md).

## Two hosts, one parking at a time

| Parking | Public API | Input queues | Processor | Production tables |
|---|---|---|---|---|
| Existing | v2/v3 on the **ColdFusion** host | `wachtrij_*`, `bezettingsdata_tmp` | CF `processTransactions2.cfm` | `transacties`, `bezettingsdata`, … |
| Test / simulation (testgemeente) | **v4 only** on the **Next.js** host | `new_wachtrij_*`, `new_bezettingsdata_tmp` | Next.js `processQueues()` | same production tables |

Isolation is at the **input queues**, not the output tables. CF never reads `new_*`. Next.js never reads CF `wachtrij_*` / `bezettingsdata_tmp`. Both processors write the same production rows. There is **no per-parking lock**.

**Do not call both hosts for the same parking.** A parking is either on CF v2/v3 or on Next.js v4. Dual-write duplicates `transacties` / `bezettingsdata`.

Next.js has no public `/api/fms/v2` or `/api/fms/v3`. After CF shutdown, Next.js stays v4-only. Existing **V2 Next.js** clients must move to v4 where a twin exists (see below). V2 methods without a v4 twin stay on ColdFusion only.

## V2 reads: no Next.js implementation

Public Next.js `/api/fms/v2` and `/api/fms/v3` were removed. Catalog aux on v4 follows the **V3** contract (`/rest/v3/...` on ColdFusion), not V2 `/REST/v1/...`.

Swagger migration pages: [V2 → V4](/test/fms-api-docs-migrate-v2), [V3 → V4](/test/fms-api-docs-migrate-v3).

| V2 (ColdFusion / old Next.js) | V4 (Next.js) | Legacy pair for compare |
|---|---|---|
| `GET /v2/getJsonBikeTypes` or `/REST/v1/getBikeTypes` (`BIKETYPEID`, `NAME`) | `GET /api/fms/v4/biketypes` (`id`, `name`, `singular`) | `/rest/v3/biketypes` |
| `GET /v2/getJsonPaymentTypes` or `/REST/v1/getPaymentTypes` (`PAYMENTTYPEID`, `NAME`, `DESCRIPTION`) | `GET /api/fms/v4/paymenttypes` (`paymenttypeid`, `name`, `description`) | `/rest/v3/paymenttypes` |
| `GET /v2/getServerTime` or `/REST/v1/getServerTime` (CF locale string) | `GET /api/fms/v4/servertime` (ISO-like timestamp) | `/rest/v3/servertime` |
| `GET /v2/getJsonClientTypes` (`CLIENTTYPEID`, `NAME`) | `GET /api/fms/v4/clienttypes` (`id`, `name`) | `/REST/v1/getClientTypes` |
| `GET /v2/getJsonBikes` (`barcode`, `biketypeID`) | `GET …/locations/{id}/bikes` (`barcode`, `biketypeid`) | `/v2/REST/getJsonBikes/{bikeparkID}` |
| `GET /v2/getJsonBikeType/{id}` | `GET /api/fms/v4/biketypes` — filter on `id` | `/rest/v3/biketypes` |

Location-level V2 reads that already have a v4/v3 resource twin (`getJsonSubscriptionTypes`, `getJsonSectors`, `getJsonBikeUpdates`, `getJsonSubscriptors`, `getLockerInfo`) keep their existing compare pairing.

Simulation Process and cron `/api/cron/process-queues` always run Next.js `processQueues()`. Check-in/out queue on Next.js is `new_wachtrij_managed_transacties` only — there is no `new_wachtrij_transacties`.

## v4 writes (Next.js)

| v4 call | Input | After `processQueues()` / rollup |
|---|---|---|
| `POST …/managedtransactions` | `new_wachtrij_managed_transacties` | `transacties` upsert on `FietsenstallingID` + `ExternalTransactionID`. A payload with `checkoutdate` also writes `transacties_archief` with the same `transacties.ID` (`source=fms-v4-managed`). Open visits do not write archief. |
| `POST …/occupation` (and occupation+sync) | `new_bezettingsdata_tmp`; also sets `fietsenstalling_sectie.Bezetting` to the reported value | rollup → `bezettingsdata` |
| `POST …` bike / pas | `new_wachtrij_pasids` | `accounts_pasids` / `accounts` |
| `POST …` saldo | `new_wachtrij_betalingen` | `financialtransactions` / `accounts` |
| `POST …` subscriptions / subscribe | (none — direct write) | `abonnementen`, `financialtransactions`, `accounts` |
| occupation body with `data.bikes` | `new_wachtrij_sync` | `transacties` (inventarisatie) |

Check-in/out on v4 is **managedtransactions** only (Wilmar). Occupation rollup is the Lumiguide path.

`POST …/completedtransactions` stays **410**. Archief is not a second client call. `putManagedTransaction` writes it after the `transacties` upsert when the visit has a check-out. Resending the same `externaltransactionid` updates that archive row, because it still points at the same `transacties.ID`. After the 18-month retention delete the live row is gone, so a later post with that external id is a new visit. Corrections have to arrive before that cleanup.

### Local processing

A managed POST only enqueues `new_wachtrij_managed_transacties`. Nothing reaches `transacties` or `transacties_archief` until the queue runs.

```bash
curl -sS http://localhost:3000/api/cron/process-queues
# when CRON_SECRET is set:
curl -sS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-queues
```

There is no GitHub Actions schedule for this route (unlike abonnementen / info-files). Production needs its own scheduler, or the simulation “Process” action, or visits stay in the queue. Each run takes at most 50 managed rows.

After a check-out for stalling `9933_001`:

```sql
SELECT COUNT(*) FROM transacties_archief WHERE locationid = '9933_001';
```

Closed `transacties` that predate this writer can be copied once:

```bash
npx tsx scripts/backfill-transacties-archief.ts --dry-run
npx tsx scripts/backfill-transacties-archief.ts --location 9933_001
```

Default scope is ZipID `9933`. `--all` covers every city. The archive id is `transacties.ID`. Migration `20261105120000_drop_transacties_archief_external_tx` removes `transacties_archief.externaltransactionid` where that column was added.

`daybeginsat` on the archief row is the organisation `contacts.DayBeginsAt` (fallback `00:00:00`). Rebuild `transacties_archief_day_cache` after a backfill if rapportage reads the cache. Sync check-outs (inventory, bike absent) still close `transacties` only; they do not write archief.

Auth for managedtransactions: Basic Auth, `operator` or `dataprovider.type2`. Batch: max 50, all-or-nothing validate then enqueue.

## 410 on v4 (use CF v2/v3)

- `POST …/transactions` and `…/completedtransactions` (In/Uit / completed)
- Locker writes: `PUT`/`POST …/places/{id}`, `/logs`, `/actions`, place `/subscriptions`
- Place-level `isAllowedToUse` (`GET …/places/{id}/idcodes/…`) and place-level `koppelpas` (`POST` same path). Location-level `POST …/idcodes/…` stays.

Reads: place list and one place stay (catalog / compare). Buurtstallingen occupancy is Java `/v1`, not FMS REST.

## What Next.js does not do

- No FMS tariff / `afboeking` on check-in/out. `Stallingskosten` comes from the managed payload. `fietsenstallingen.BerekentStallingskosten` is unused by the Next.js processor. A leftover `type=afboeking` queue row is marked error, not applied.
- No CF-style `Bezetting` +1/−1 on In/Uit. Occupation sets `Bezetting` from the reported number; managedtransactions does not change it.
- No processing of CF `wachtrij_*` / `bezettingsdata_tmp`.
- No In/Uit HTTP, completedtransactions, locker control, or `new_wachtrij_transacties` drain.

Write-sequence smoke is on `/test/fms-write-tests` → **Sequences** (teststalling / testgemeente `9933`, prefix `WTEST_API_`). Example flows were derived from Utrecht Vredenburg CF wachtrij patterns.

## After Phase 7 (todo)

After `acceptance` → `main` (production v4):

1. Copy the **testdatabase from production** onto local/dev (V4 compare reads this DB).
2. Re-run the full **FMS read comparison** (`/test/fms-api-compare`, CF vs v4).
3. Fix remaining errors. Current diffs against live CF are mostly stale local data, not contract.
