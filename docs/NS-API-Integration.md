# NS API Gateway Integration Documentation

## Overview

This document describes the NS (Nederlandse Spoorwegen) Places API integration: how the gateway is called, how responses are structured, and how fields are mapped into VeiligStallen (`fietsenstallingen`).

There are two implementations:

| | **ColdFusion (legacy)** | **Next.js (current)** |
|---|-------------------------|------------------------|
| Connector | `broncode/.../NsLocationConnector.cfc` | `src/server/services/ns-connector/` |
| Trigger | Cron via `externe_apis` / `externalAPIs.cfm` | `/api/cron/ns-locations`, Beheer → **Achtergrondprocessen → NS Koppeling** |
| API key | Hardcoded in CFC (legacy) | `NSCONNECTOR_SUBSCRIPTION_KEY` in environment |
| Field mapping | Literal copy of most NS strings | **Same for facility types and most fields; opening hours follow NS semantics (see below)** |

When behaviour differs, **Next.js is authoritative** for new deployments. ColdFusion sections below are kept for parity checks and migration context.

---

## ColdFusion vs Next.js: mapping differences

### Same in both implementations

- **API**: `GET https://gateway.apiportal.ns.nl/places-api/v2/places` with the same two query sets (fietskluizen first, then fietsenstallingen).
- **Facility type → stalling type** (`fietsenstallingtypen.id`):

  | NS `type.name` | `Type` (DB id) | `StallingsID` prefix |
  |----------------|----------------|----------------------|
  | Bemenste fietsenstalling | `bewaakt` | `bwt` |
  | Zelfservice fietsenstalling | `geautomatiseerd` | `aut` |
  | Fietskluis | `fietskluizen` | `fkl` |

- **Council / exploitant**: data owner `ns` (`SiteID`); exploitant `ns-stations` when present (`ExploitantID`).
- **Core fields**: coordinates, title, description, image, address, regime → `NotaVerwijssysteem` / `Tariefcode`, defaults (`IsStationsstalling`, `FMS = false`, `EditorCreated` / `EditorModified` = `NS-connector`, etc.).

### Next.js only: `infoImages` and `infoUrl`

ColdFusion uses only the first `infoImages[].link.uri` as photo (`Image`) and ignores `body` / `infoUrl`.

Next.js (`buildInfoTextFields`):

| NS source | DB field | UI |
|-----------|----------|-----|
| `infoImages` where `title` = **Tarief Toelichting** (`body`) | `OmschrijvingTarieven` | Sectie **Tarief** |
| `infoImages` where `title` = **Memo** (`body`) | `Openingstijden` | Vrije tekst onder openingstijden-rooster |
| `infoUrl` | `Url` | (veld beschikbaar; beperkt in standaard detail-UI) |
| `title` = **Storing** | — | **Niet** geïmporteerd (dagelijkse sync) |

Plain text from NS is stored as escaped HTML with `<br />` line breaks.

### Different: opening hours (`openingHours` / `openinghours`)

ColdFusion copies NS `startTime` and `endTime` onto the weekday columns via `setOpenMo` / `setCloseMo` etc. It does **not** use `closesNextDay` or `location.open`. Strings that ColdFusion cannot parse as times (notably **`24:00`**) leave the close field empty.

Next.js maps each row with `nsOpeningHourToDbTimes()` in `mapping.ts` so stored times match **regular stalling conventions** and **NS UI meaning** (e.g. “gehele dag (24 uur)”, `07:00 - 24:00`):

| NS input | ColdFusion (typical DB result) | Next.js (intended DB result) |
|----------|------------------------------|------------------------------|
| `open: Unknown` or no hours | Leaves existing DB times unchanged on update | Sets **all** `Open_*` / `Dicht_*` to `null` |
| Has `openingHours` | Only sets days present in the array | Clears **all** day columns, then sets each returned day |
| `00:00` – `24:00` (incl. `closesNextDay: true`) | Open `00:00`, close often **null** | `00:00` / **`23:59`** (24h, same as manual “gehele dag geopend”) |
| Same day, `end: 24:00`, `closesNextDay: false` | Close often **null** | Open = `start`, close = **`00:00`** (open until end of calendar day) |
| Overnight, `closesNextDay: true` (e.g. `05:20` – `01:10`) | `05:20` / `01:10` on that weekday | Same storage (overnight = close before open on the clock; used by `opening-hours.ts`) |
| Same-day times, `closesNextDay: false` | `start` / `end` as parsed | Same |

Display in the Next.js app uses these DB conventions (e.g. `23:59` → **24h**, close at `00:00` with open &gt; midnight shown as **24:00**), not ColdFusion’s `helperclass` rules.

### Different: external id / `StallingsID`

Both use the last segment of `location.link.uri` after `-`, and prefix numeric ids with `{prefix}-`.

Next.js additionally:

- Takes the segment after `/` when the suffix contains a slash (long NS compound ids).
- Validates `StallingsID` length (max 8 characters) and can skip or fail locations that do not fit.

---

## Next.js implementation (reference)

| Area | Location |
|------|----------|
| Fetch + query order | `src/server/services/ns-connector/client.ts` |
| Type + field mapping | `src/server/services/ns-connector/mapping.ts` |
| Sync / dry-run | `src/server/services/ns-connector/sync.ts` |
| Tests | `src/server/services/ns-connector/mapping.test.ts` (`npx tsx --test …`) |
| Types | `src/types/ns-connector.ts` |

**Requirements:** contact `UrlName` `ns` (and optionally `ns-stations`), `NSCONNECTOR_SUBSCRIPTION_KEY` set.

---

## ColdFusion: when the gateway is called

### Execution trigger

The NS API gateway is called via the cronjob file: `broncode/remote/cronjobs/externalAPIs.cfm`

### Scheduling logic

#### 1. Daily execution mode (`getDaily() = true`)

- **Frequency**: Once per day
- **Start time**: From 3:30 AM onwards
- **Execution window**: Runs when:
  - Current time is after 3:30 AM
  - AND minute of current hour MOD 10 ≤ 1 (runs at :00, :01, :10, :11, :20, :21, etc.)
  - AND either:
    - No previous request timestamp exists, OR
    - Last request was ≥ 23 hours ago
  - OR `?forceevents` URL parameter is present (manual trigger)

#### 2. Interval-based execution mode (`getDaily() = false`)

- **Frequency**: Based on configured interval (in minutes)
- **Execution condition**: Runs when:
  - No previous request timestamp exists, OR
  - Time since last request ≥ configured interval
  - OR `?force` URL parameter is present (manual trigger)

### Execution flow

1. **Cronjob entry point** (`externalAPIs.cfm`):
   - Loops through all external APIs retrieved via `application.service.getExternalApis()`
   - For each external API that has locations (`hasExternalApiLocations()`):
     - Determines execution mode (daily vs interval-based)
     - Checks if execution conditions are met
     - Retrieves connector instance via `externalApi.getConnector()`
     - Calls `connector.execute()`

2. **Connector instantiation** (`ExternalApi.cfc`):
   - Creates connector instance using the `Class` property from database
   - For NS: Creates `nl.fietsberaad.connector.ns.NsLocationConnector`
   - Sets the external API reference on the connector

---

## ColdFusion: how the output is processed

### API call execution (`NsLocationConnector.cfc`)

#### Step 1: Execute method

The `execute()` method calls two endpoints sequentially:

1. **Fietskluizen**: `executeEndpoint(this.query_params_fietskluizen)`
2. **Stationsstallingen**: `executeEndpoint(this.query_params_stallingen)`

#### Step 2: HTTP request (`getLocations()` method)

- **Endpoint**: `https://gateway.apiportal.ns.nl/places-api/v2/places`
- **Method**: GET
- **Headers**: `Ocp-Apim-Subscription-Key` (legacy: embedded in CFC)
- **Query parameters**:
  - Fietskluizen: `type=stationfacility&radius=1000&name=fietskluis&limit=500` (NS had ~355 locaties in 2026; ColdFusion used 250)
  - Stallingen: `type=stationfacility&radius=1000&identifier=fietsenstalling&limit=500` (~106 locaties)
- **Response**: JSON payload: `DeSerializeJSON(r.filecontent).payload`

#### Step 3: Response processing

The response is an array of objects with:

- `name`: Facility type name
- `locations`: Array of location objects

```
For each type in result array:
  For each location in type.locations array:
    Process location data
```

#### Step 4: Location processing (ColdFusion)

For each location:

1. **External ID generation** (see comparison table above for Next.js extras).
2. **Bikepark lookup/creation** under council `ns`, exploitant `ns-stations` if present, defaults for new NS bikeparks.
3. **Data mapping** (ColdFusion — opening hours are **literal** NS times):

   | NS API field | Prisma / CF field | ColdFusion notes |
   |--------------|-------------------|------------------|
   | `location.lat`, `location.lng` | `Coordinaten` | `"lat,lng"` |
   | `location.name` | `Title` | |
   | `location.description` | `Description` | Empty if missing |
   | `location.openinghours[]` | `Open_*` / `Dicht_*` | `dayOfWeek` 1–7 → Mo–Su; **`startTime` / `endTime` only**; ignores `closesNextDay` and `open` |
   | `location.infoImages[0].link.uri` | `Image` | First image or empty |
   | `location.extra.regime` | `NotaVerwijssysteem` | `Tariefcode = 1` if regime = betaald |
   | `location.postalCode` | `Postcode` | |
   | `location.city` | `Plaats` | |
   | `location.street` + `houseNumber` | `Location` | |

4. **Standard fields**: `EditorModified`, `DateModified`, `Type`, `FMS = false`, etc.
5. **Save**: `application.service.saveBikepark(bp)`

#### Error handling (ColdFusion)

- Location-level errors: logged via `mailcontroller.toDB()`; other locations continue.
- API errors: propagate to cronjob.

### Data flow summary (ColdFusion)

```
Cronjob (externalAPIs.cfm)
  ↓
ExternalApi.getConnector() → NsLocationConnector
  ↓
connector.execute()
  ↓
executeEndpoint(fietskluizen) → getLocations() → HTTP GET → JSON
  ↓
Process each location → save bikepark
  ↓
executeEndpoint(stallingen) → (same)
```

---

## Key files (ColdFusion)

- **Cronjob**: `broncode/remote/cronjobs/externalAPIs.cfm`
- **Connector**: `broncode/cflib/nl/fietsberaad/connector/ns/NsLocationConnector.cfc`
- **Model**: `broncode/cflib/nl/fietsberaad/model/bikepark/ExternalApi.cfc`
- **Service**: `broncode/cflib/nl/fietsberaad/service/BikeparkServiceImpl.cfc`

## Configuration (ColdFusion)

External API configuration is stored in the `externe_apis` table:

- `Name`, `Class` (e.g. `nl.fietsberaad.connector.ns.NsLocationConnector`)
- `Interval`, `Daily`, `LastRequest`

## Notes

- Both implementations process **fietskluizen** and **stationsstallingen** in one run (order: kluizen, then stallingen).
- NS-synced bikeparks use `IsStationsstalling = true`.
- External ID prefixes keep types distinct in `StallingsID` / external id.
- After changing Next.js opening-hour mapping, run an **NS re-import** so existing rows match the new rules.
