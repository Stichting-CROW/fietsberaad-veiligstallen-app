# Documentation Overview

### Transaction flow and motorblok

| File | Purpose | Action |
|------|---------|--------|
| docs/analyse-motorblok/SERVICES_FMS.md | ColdFusion FMS API documentation | |
| docs/analyse-motorblok/SERVICES_REPORTING.md | Reporting API documentation | |
| docs/analyse-motorblok/SERVICES_DATASTANDARD.md | Datastandard REST API v2 documentation | |
| docs/analyse-motorblok/stroomdiagram-stallingstransacties_v2.md | Mermaid flowchart for transactions | |
| docs/analyse-motorblok/wachtrij-transactie-processing-stappen.md | Wachtrij processing steps (detailed) | |
| docs/analyse-motorblok/wachtrij-transacties-processing-flow.md | Wachtrij transactions processing flow overview | |
| docs/analyse-motorblok/wachtrij-tables-api-methods.md | Wachtrij tables and API methods | |
| docs/analyse-modules/controle-transaction-flow.md | Control transaction flow | |
| docs/analyse-modules/abonnementsvormen-access.md | Abonnementsvormen access | |

---

## Cursor chats (APIs, wachtrijtabellen, transaction processing)

Chat transcripts stored in `~/.cursor/projects/storage-veiligstallen-fietsberaad-veiligstallen-app/agent-transcripts/`:

| Transcript ID | Topic |
|---------------|-------|
| 7a8ff6a9-7e42-4a39-b729-166dba3c88b9 | Which API methods put data into wachtrij_xxxx tables in ColdFusion broncode |
| c6a17c96-8c90-4e0c-a830-418a9a0654b3 | How ds_ tables are managed; does open data API operate on ds_ vs non-ds_ tables |
| f83f9169-6848-4ba2-a5c5-6552e297ba27 | SQL query: siteids, parking ids, last transactiondate from transacties_archief |
| 7aeaa376-ec84-43be-b146-cd7b084b430b | Port ColdFusion APIs to Next.js with Swagger; backend functions for processing transactions |
| 0c15554b-e117-401e-9a83-f50f0b48b956 | Why bike-types API works but bike-updates does not with same basic auth |
| 004fa896-4fd6-418e-b6bd-7c7663122911 | Procedure when deleting fietsenstalling with linked data in transacties_archief |
| e0ba5764-1a6b-4547-83d7-9f9125a24123 | When exploitantID, beheerder, beheerderContact are visible/editable in ColdFusion client API |

---

## Cursor plans (APIs, wachtrij, transaction processing)

Plans stored in `~/.cursor/plans/`:

| Plan file | Topic |
|-----------|-------|
| api_porting_and_transaction_processing_c799dce3.plan.md | Port ColdFusion APIs (FMS, Datastandard, Reporting) to Next.js with Swagger; backend transaction processing; type safety architecture (Phase 2.5) |
| data_owner_change_relations_ecdaa4c5.plan.md | Relations when changing fietsenstallingen.SiteID (data owner) |
| documentation_reorganization_plan_df3c4eec.plan.md | Documentation reorganization |

---

## Project plans (in docs/analyse-motorblok)

| Plan file | Topic |
|-----------|-------|
| API_PORTING_PLAN.md | FMS REST API and transaction processing |
| DATASTANDARD_REPORTING_API_PLAN.md | Datastandard and Reporting APIs (separate implementation) |

---

## External APIs and URLs (from ColdFusion broncode)

*Extracted from `broncode/` – APIs the app calls out to, and APIs it exposes.*

### Outbound – APIs called by ColdFusion

| Base URL | Purpose | Source |
|----------|---------|--------|
| `https://reserveringen.veiligstallen.nl/` | Buurtstallingen/reserveringen API (BikeparkcontrollerApi, BikeparkoccupationcontrollerApi, BikeparkwaitinglistcontrollerApi) | `Application.cfc` buurtstallingenApiBasePath, `BuurtstallingenService.cfc` |
| `https://reserveringen.veiligstallenontwikkel.nl/` | Same, acceptance | `Application.cfc`, tests |
| `http://www.fietsberaad.nl/system/components/members_remote_Utility.cfc` | Fietsberaad members webservice | `www/Application.cfc` webservice_fietsberaad |
| `https://remote.veiligstallen.nl/phpmollieproxy.php` | Mollie payment proxy | `remote/Application.cfc` molliePhpStub |
| `https://remote.veiligstallen.nl/MollieService.cfc?method=webhook` | Mollie webhook (URL configured for Mollie) | `www/Application.cfc` mollie webhookUrl |
| `https://maps.googleapis.com/maps/api/js` | Google Maps API | `www/views/` (maps, places) |
| `http://www.barcodesinc.com/generator/image.php` | Barcode image generator | `www/pdf/stallingen/abonnement.cfm` |

### Inbound – APIs exposed at remote.veiligstallen.nl

| Path | API | Notes | Documentation |
|------|-----|-------|---------------|
| `https://remote.veiligstallen.nl/REST/v1/` | FMS REST v1 | `remote/REST/FMSService.cfc` | — |
| `https://remote.veiligstallen.nl/v2/FMSService.cfc` | FMS v2 SOAP/CFC | `remote/v2/FMSService.cfc` | — |
| `https://remote.veiligstallen.nl/v2/REST/{method}/{bikeparkID}/{sectorID}` | FMS v2 REST | Same component as SOAP | — |
| `https://remote.veiligstallen.nl/rest/v3/citycodes/...` | FMS REST v3 | `remote/REST/v3/fms_service.cfc` | `docs/documentatie-crow/1-api/FMSservice-rest_v3.0.4.pdf` (full API), `FMSservice-open_data_v0.1.pdf` (open data subset) |
| `https://remote.veiligstallen.nl/rest/api/v2/` | Datastandard API v2 | surveys, organisations, parking-locations, etc. | CROW: [Datastandaard fietsparkeren](https://docs.crow.nl/#sectie-datastandaard-fietsparkeren) |
| `https://remote.veiligstallen.nl/rest/reporting/v1/` | Reporting API v1 | transacties (transactions) | `docs/documentatie-crow/1-api/RapportageAPI_v2.2.pdf` |
| `https://remote.veiligstallen.nl/rest/reporting/v2/` | Reporting API v2 | occupation (bezettingsdata), subscriptions | `docs/documentatie-crow/1-api/RapportageAPI_v2.2.pdf` |
| `https://remote.veiligstallen.nl/MollieService.cfc?method=webhook` | Mollie webhook | Payment callbacks | — |
| `https://remote.veiligstallen.nl/SHPV/index.cfm` | SHPV SOAP service | verwijsindex | — |
| `https://remote.veiligstallen.nl/remote/processTransactions2.cfm` | Queue processor | Cron | — |
| `https://remote.veiligstallen.nl/remote/resetOccupations.cfm` | Reset occupations | Cron | — |

### Datastandard dashboard – calls to own REST API

The dashboard uses `URL_WEBSERVICE = {request_host}/rest/api/v2` and calls `/surveys`, `/survey-areas`, `/sections`, `/parking-locations`, `/canonical-vehicle-categories`, `/observations` via the gateways in `remote/dashboard/actions/datastandaard/`.

### Dynamic outbound – locker callbacks

- **Place.getRemoteEndpoint()** → `{application.remote}/rest/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}` – GET place status
- **Place.getFullUrlWebservice()** → `{place.urlwebservice}/citycodes/.../places/{placeid}` – PUT to locker (urlwebservice from DB, per place)

### Scheduler / cron URLs (scheduler.xml)

| URL | Task |
|-----|------|
| `http://fms.veiligstallen.nl/remote/cronjobs/overboeken.cfm` | Overboeken |
| `http://www.veiligstallen.nl/remote/cronjobs/updateKmlFiles.cfm` | Update KML |
| `http://remote.veiligstallen.nl/remote/processTransactions2.cfm` | Wachtrij transacties (every 61s) |
| `http://www.veiligstallen.nl/system/components/fietsenstalling_kml.cfc?method=generateInfoFiles` | Generate info files |
| `http://fms.veiligstallen.nl/remote/cronjobs/rapportage_csv.cfm?reports=bezetting` | Rapportage bezetting |
| `http://www.veiligstallen.nl/remote/cronjobs/abonnementen.cfm` | Abonnementen |
| `http://fms.veiligstallen.nl/remote/cronjobs/bulkreserveringen.cfm` | Bulkreserveringen |
| `http://www.veiligstallen.nl/remote/cronjobs/reserveringen.cfm` | Reserveringen |
| `http://fms.veiligstallen.nl/remote/cronjobs/rapportage_csv.cfm?reports=ruwedata` | Rapportage ruwe data |
| `http://fms.veiligstallen.nl/remote/cronjobs/rapportage_csv.cfm?reports=transacties` | Rapportage transacties |
| `http://fms.veiligstallen.nl/remote/cronjobs/financialReports.cfm` | Financial reports |
| `http://remote.veiligstallen.nl/remote/resetOccupations.cfm` | Reset occupations |
| `http://fms.veiligstallen.nl/remote/cronjobs/checkAbonnementen.cfm` | Check abonnementen |
| `http://fms.veiligstallen.nl/remote/cronjobs/updateTableBezettingsdata.cfm` | Update bezettingsdata |
| `https://remote.veiligstallen.nl/?reinit` | Init remote |
| `https://fms.veiligstallen.nl/?reinit` | Init FMS |
| `https://www.veiligstallen.nl/?reinit` | Init www |
| `https://presentaties.veiligstallen.nl/?reinit` | Init presentaties |

### Environment variants

| Env | remote | reserveringen |
|-----|--------|----------------|
| Production | `https://remote.veiligstallen.nl` | `https://reserveringen.veiligstallen.nl/` |
| Acceptance | `https://remote.veiligstallenontwikkel.nl` | `https://reserveringen.veiligstallenontwikkel.nl/` |
| Test (veiligstallen2) | `https://remote.veiligstallen2.nl` | — |
| Local | `http://remote.veiligstallen:8888` | `http://127.0.0.1:8888/bikepark/` |

---

### Cronjob descriptions (from scheduler.xml and ColdFusion broncode)

| Task | Function |
|------|----------|
| **Overboeken** | Balances stalling credits/debits between exploitants and Fietsberaad. For each account with non-zero balance (from `vw_stallingstegoedenexploitant`), calls `account.overboeken()` to transfer funds. Hourly (paused). |
| **Update KML** | Generates KML files per stalling type (bewaakt, toezicht, geautomatiseerd, onbewaakt, fietskluizen, buurtstalling, fietstrommel) via `fietsenstalling_kml.getFietsenstallingen(type)`. Every 4 hours (paused). |
| **Wachtrij transacties** | Processes the transaction queue: (1) processes `wachtrij_pasids` (bike/pass updates), (2) isolates and processes `wachtrij_transacties` (in/uit), writes to `transacties`, updates `fietsenstalling_sectie.Bezetting`. Every 61 seconds. |
| **Generate info files** | Regenerates `veiligstallen.kml` and `veiligstallen.xml` with stalling data (capacity, occupancy, opening hours, etc.) for maps and integrations. Skips between 03:00–04:59. Every 601 seconds. |
| **Rapportage bezetting** | Produces occupancy reports (CSV) per gemeente/stalling for the past period. Weekly. |
| **Abonnementen** | Handles expired subscriptions: deactivates them, sends expiry emails, and sends "expiring soon" warnings (2 weeks before). Daily. |
| **Bulkreserveringen** | Maintains bulk reservations: archives expired recurring ones, shifts recurring reservations by one week when expired, cleans up exceptions. Daily. |
| **Reserveringen** | Handles locker (kluis) reservations: converts expired reservations to normal transactions, sends expiry and "expiring in 48h" emails. Daily. |
| **Rapportage ruwe data** | Produces raw data reports (CSV) per gemeente. Daily. |
| **Rapportage transacties** | Produces transaction reports (CSV) per gemeente. Daily. |
| **Financial reports** | Generates monthly financial overview PDFs for gemeenten and exploitants (income, expenses, subscriptions, etc.). Monthly. |
| **Reset occupations** | Recalculates `fietsenstalling_sectie.Bezetting` for FMS sections: `occupation + wachtrij_in - wachtrij_uit`. Does not modify `wachtrij_transacties`. Every 301 seconds. |
| **Check abonnementen** | Finds paid subscriptions that were not activated (`isBetaald = 0` but payment status = ok) and emails them for manual activation. Daily. |
| **Update bezettingsdata** | Updates the occupancy/bezettingsdata table from transaction data (or Lumiguide) for reporting. With `?timeintervals=15`. Daily. |
| **Init (www, fms, remote, presentaties)** | Reinitialises the ColdFusion application: calls `onApplicationStart()`, clears session, reloads ORM. Ensures config and beans are refreshed. Daily, staggered (03:52–03:55). |

---

### FMS API – tables affected and beheerbackend coverage

*From `docs/analyse-motorblok/SERVICES_FMS.md`. GET = read; PUT/POST = create/update/delete. Queue tables (`wachtrij_*`) are written by the API and processed by `processTransactions2.cfm` into the destination tables. Includes tables affected indirectly (e.g. via database triggers).*

| Table | FMS API READ (GET) | FMS API CREATE/UPDATE/DELETE | Indirect (trigger etc.) | Managed by beheerbackend | Notes |
|-------|-------------------|-----------------------------|--------------------------|--------------------------|-------|
| `transacties` | ✓ getBikeUpdates | — (via wachtrij_transacties → processTransactions2) | — | No | Reports read; no CRUD UI |
| `transacties_archief` | — | — | ✓ Trigger on `transacties` (INSERT/UPDATE when both checkin and checkout set) | No | Completed transactions; Reporting API reads |
| `accounts_pasids` | ✓ getBikeUpdates, getLockerInfo, isAllowedToUse | — (via wachtrij_pasids, subscribe, wachtrij_transacties) | — | No | Derived from queue processing |
| `gemeenteaccounts` | ✓ getBikeUpdates | — | — | No | No UI |
| `accounts` | ✓ getBikeUpdates | ✓ addSubscription, subscribe | — | Stub | AccountsComponent is placeholder only |
| `barcoderegister` | ✓ getBikes | — | — | No | No UI |
| `fietstypen` | ✓ getBikeType, getBikeTypes | — | — | Read-only | Reference data; used in forms, no CRUD |
| `fietsenstallingen` | ✓ getSectors | — | — | Yes | Fietsenstallingen + ParkingEdit |
| `fietsenstalling_sectie` | ✓ getSectors | ✓ reportOccupationData (Bezetting), resetOccupations | — | Yes | Secties CRUD; Bezetting from API/cron |
| `abonnementsvormen` | ✓ getSubscriptionTypes | — | — | Yes | Abonnementsvormen |
| `abonnementsvorm_fietsenstalling` | ✓ getSubscriptionTypes, getSubscriptors | — | — | Yes | Via abonnementsvormen + parking |
| `klanttypen` | ✓ getClientTypes | — | — | No | No UI |
| `fietsenstalling_plek` | ✓ getLockerInfo | ✓ setUrlWebserviceForLocker, updateLocker | — | No | Lockers; no UI |
| `fietsenstalling_plek_bezetting` | ✓ getLockerInfo, isAllowedToUse | ✓ updateLocker | — | No | No UI |
| `wachtrij_pasids` | — | ✓ saveBike, saveBikes | — | View only | WachtrijMonitor; no edit |
| `wachtrij_betalingen` | — | ✓ addSaldo, addSaldos | — | View only | WachtrijMonitor |
| `wachtrij_transacties` | — | ✓ uploadTransaction, uploadTransactions, updateLocker | — | View only | WachtrijMonitor |
| `wachtrij_sync` | — | ✓ syncSector | — | View only | Sync events in reports |
| `abonnementen` | ✓ getSubscriptors | ✓ addSubscription, subscribe | — | No | No CRUD UI |
| `financialtransactions` | — | ✓ addSubscription, addSaldo (via wachtrij_betalingen) | — | No | No CRUD UI |
| `bezettingsdata` | — | ✓ reportOccupationData | — | No | Reports read; no CRUD |
| `contacts` | ✓ (auth: fmsservice_permit) | — | — | Yes | Gemeenten, exploitanten, dataproviders |
| `fmsservice_permit` | ✓ (auth) | — | — | No | Auth table; no UI |

---

### Workflowy export (paste into Workflowy)

- VeiligStallen – FMS API + processen (per tabel: API, processen, beheer)
  - transacties
    - API READ: getBikeUpdates
    - API WRITE: via wachtrij_transacties → processTransactions2
    - Process READ: processTransactions2, resetOccupations, Rapportage bezetting, Rapportage ruwe data, Rapportage transacties, Update bezettingsdata (transacties)
    - Process WRITE: processTransactions2
    - Beheer: No
  - transacties_archief
    - INDIRECT: Trigger on transacties (INSERT/UPDATE when both checkin and checkout set)
    - Beheer: No
  - barcoderegister
    - API READ: getBikes
    - Beheer: No
  - fietstypen
    - API READ: getBikeType, getBikeTypes
    - Beheer: Read-only (reference data)
  - klanttypen
    - API READ: getClientTypes
    - Beheer: No
  - wachtrij_pasids
    - API WRITE: saveBike, saveBikes
    - Process READ: processTransactions2
    - Process WRITE: processTransactions2
    - Beheer: View only (WachtrijMonitor)
  - wachtrij_transacties
    - API WRITE: uploadTransaction, uploadTransactions, updateLocker
    - Process READ: processTransactions2, resetOccupations
    - Process WRITE: processTransactions2
    - Beheer: View only
  - wachtrij_sync
    - API WRITE: syncSector
    - Process READ: processTransactions2
    - Process WRITE: processTransactions2
    - Beheer: View only (sync events in reports)
  - bezettingsdata
    - API WRITE: reportOccupationData
    - Process READ: Rapportage bezetting, Rapportage ruwe data
    - Process WRITE: Update bezettingsdata (Lumiguide), Update bezettingsdata (transacties)
    - Beheer: No
  - contacts
    - API READ: auth (fmsservice_permit)
    - Process READ: processTransactions2, Rapportage bezetting, Rapportage ruwe data, Rapportage transacties, Update bezettingsdata (transacties)
    - Beheer: Yes (gemeenten, exploitanten, dataproviders)
  - fmsservice_permit
    - API READ: auth
    - Beheer: No (auth table)
  - bezettingsdata_tmp
    - Process READ: Update bezettingsdata (Lumiguide)
    - Process WRITE: Update bezettingsdata (Lumiguide) (TRUNCATE)
    - Beheer: No
  - rapportageinfo
    - Process READ: Rapportage bezetting, Update bezettingsdata (transacties)
    - Process WRITE: Update bezettingsdata (transacties)
    - Beheer: No
  - toekomst (uitgesloten functionaliteit)
    - Bulkreserveringen
      - bulkreservering
    - Fietskluizen
      - fietsenstalling_plek
      - fietsenstalling_plek_bezetting
    - Buurtstallingen
      - fietsenstallingen
      - fietsenstalling_sectie
    - Abonnementen
      - abonnementen
      - abonnementsvormen
      - abonnementsvorm_fietsenstalling
    - Mollie transacties / Financiele rapportage / Overboekingen
      - wachtrij_betalingen
      - financialtransactions
    - Gebruikersaccounts
      - accounts
      - accounts_pasids
      - gemeenteaccounts
    - Genereren KML / XML bestanden
      - (geen tabellen; export uit fietsenstallingen/locaties)
