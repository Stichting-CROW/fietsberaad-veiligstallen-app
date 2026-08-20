# Temporary: acceptance → main TODO

Scratch notes from review of `origin/main...acceptance` (`2c38889`). Delete after acc→main PR is merged.

Fixes for FMS subscribe and reporting auth are on `fix/20260819-merge-to-main` — merge that branch before acc→main.

---

## Accept before acc→main (will not resolve in code)

| # | Area | Issue | Files |
|---|------|--------|-------|
| P1 | Simulation config | FMS API password in column `apiPasswordEncrypted` without encryption; DB columns remain (browser localStorage mitigates on fix branch). | `parking-simulation/config.ts`, `SettingsTab.tsx` |
| P2 | Replay reset | `resetNewTables()` wipes **all** rows in global `new_*` tables (no tenant scope). | `replay-archive-service.ts`, `replay-archive/index.ts` |
| P2 | Tier B write tests | Some scenarios write production `wachtrij_transacties`; teardown may leave processor side effects. | `api-write-test-scenarios.ts` |
| P2 | SSRF | Tier B runner accepts arbitrary `baseUrl` in POST body → server-side `fetch`. | `fms-api-write-tests/index.ts` |

Superadmin-only tooling — restrict usage on shared DBs.

---

## Pre-merge checklist

- [ ] Merge `fix/20260819-merge-to-main` into acceptance
- [ ] Smoke-test reporting API auth (`EncryptedPassword2` user, disabled user rejected)
- [ ] Smoke-test `subscribe()` with unknown passID (no auto-create)
- [ ] Create testgemeente → link dataprovider → run Tier B tests
- [ ] Fietsberaad FMS overzicht vs gemeente FMS permits — same row, both UIs
- [ ] Test index: superadmin buttons (FMS-toegang, reporting compare, replay, schrijf-tests)

---

## Deferred (not blocking acc→main)

Reporting CF parity gaps: exploitant scoping in `getLocationsForUser`, `citycode` cross-check, pagination offset, `pageSize` defaults, `resolvePeriod`, operational limits/CORS/error shapes.

Dual FMS permit UIs (`GekoppeldeLocaties` vs `GemeenteFmsPermits`) — clarify operator workflow long-term.

**Decision:** “Close enough” reporting CF parity is **OK** for first acc→main merge. CF remains canonical until consumers cut over; deferred gaps tracked post-merge.
