# FMS write paths (v4 / Next.js vs v2/v3 / ColdFusion)

Current write split. Read `fields` behaviour stays in [fms-v3-fields-query-werkelijk-gedrag.md](fms-v3-fields-query-werkelijk-gedrag.md).

## Two hosts, one parking at a time

| Parking | Public API | Input queues | Processor | Production tables |
|---|---|---|---|---|
| Existing | v2/v3 on the **ColdFusion** host | `wachtrij_*`, `bezettingsdata_tmp` | CF `processTransactions2.cfm` | `transacties`, `bezettingsdata`, … |
| Test / simulation (testgemeente) | **v4 only** on the **Next.js** host | `new_wachtrij_*`, `new_bezettingsdata_tmp` | Next.js `processQueues()` | same production tables |

Isolation is at the **input queues**, not the output tables. CF never reads `new_*`. Next.js never reads CF `wachtrij_*` / `bezettingsdata_tmp`. Both processors write the same production rows. There is **no per-parking lock**.

**Do not call both hosts for the same parking.** A parking is either on CF v2/v3 or on Next.js v4. Dual-write duplicates `transacties` / `bezettingsdata`.

Next.js has no public `/api/fms/v2` or `/api/fms/v3`. After CF shutdown, Next.js stays v4-only.

Simulation Process and cron `/api/cron/process-queues` always run Next.js `processQueues()`. The UI can still **view** leftover CF `wachtrij_*` (checkbox “Toon ColdFusion-wachtrijen”); that does not process them. Check-in/out queue on Next.js is `new_wachtrij_managed_transacties` only — there is no `new_wachtrij_transacties`.

## v4 writes (Next.js)

| v4 call | Input | After `processQueues()` / rollup |
|---|---|---|
| `POST …/managedtransactions` | `new_wachtrij_managed_transacties` | `transacties` upsert on `FietsenstallingID` + `ExternalTransactionID` |
| `POST …/occupation` (and occupation+sync) | `new_bezettingsdata_tmp`; also sets `fietsenstalling_sectie.Bezetting` to the reported value | rollup → `bezettingsdata` |
| `POST …` bike / pas | `new_wachtrij_pasids` | `accounts_pasids` / `accounts` |
| `POST …` saldo | `new_wachtrij_betalingen` | `financialtransactions` / `accounts` |
| `POST …` subscriptions / subscribe | (none — direct write) | `abonnementen`, `financialtransactions`, `accounts` |
| occupation body with `data.bikes` | `new_wachtrij_sync` | `transacties` (inventarisatie) |

Check-in/out on v4 is **managedtransactions** only (Wilmar). Occupation rollup is the Lumiguide path.

Auth for managedtransactions: Basic Auth, `operator` or `dataprovider.type2`. Batch: max 50, all-or-nothing validate then enqueue.

## 410 on v4 (use CF v2/v3)

- `POST …/transactions` and `…/completedtransactions` (In/Uit / completed)
- Locker writes: `PUT`/`POST …/places/{id}`, `/logs`, `/actions`, place `/subscriptions`

Reads (place list, one place, `isAllowedToUse`) stay.

## What Next.js does not do

- No FMS tariff / `afboeking` on check-in/out. `Stallingskosten` comes from the managed payload. `fietsenstallingen.BerekentStallingskosten` is unused by the Next.js processor. A leftover `type=afboeking` queue row is marked error, not applied.
- No CF-style `Bezetting` +1/−1 on In/Uit. Occupation sets `Bezetting` from the reported number; managedtransactions does not change it.
- No processing of CF `wachtrij_*` / `bezettingsdata_tmp`.
- No In/Uit HTTP, completedtransactions, locker control, or `new_wachtrij_transacties` drain.
