# Documentation of Reporting API services #

## API Overview ##

The Reporting API exposes read-only endpoints to fetch raw transactions and occupation (bezetting) data for cities and locations a user is authorized to access.

| Method | Version | Access | HTTP | Path | Description |
|--------|---------|--------|------|------|-------------|
| getLocationsForUser | V1 | r | GET | `/v1/auth` | List councils and locations available to the current user |
| getTransactionsForCity | V1 | r | GET | `/v1/citycodes/{citycode}/transactions` | Raw transactions across all locations in a city |
| getTransactionsForBikepark | V1 | r | GET | `/v1/citycodes/{citycode}/locations/{locationid}/transactions` | Raw transactions for a specific location |
| getOccupationForCity | V1 | r | GET | `/v1/citycodes/{citycode}/occupation` | Occupation time series across all locations in a city |
| getOccupationForBikepark | V1 | r | GET | `/v1/citycodes/{citycode}/locations/{locationid}/occupation` | Occupation time series for a location |
| getOccupationForSections | V1 | r | GET | `/v1/citycodes/{citycode}/locations/{locationid}/sections/occupation` | Occupation time series grouped by section for a location |

**Legend:**
- **r**: read-only

## API V1 services ##

### authentication ###

V1 uses HTTP Basic Authentication (same mechanism as other APIs). Authorization is enforced per endpoint using `checkRights()` against the user's allowed councils/locations.

- Admin (`role = admin`) has access to all endpoints
- Non-admin users must be linked to councils via `security_users_sites`
- On unauthorized access: HTTP 401 with `WWW-Authenticate: Basic realm="FMSService"`

### API methods ###

#### Utility

**getLocationsForUser**
- Description: Returns the loginname, optional company, and all accessible cities with their locations for the current user
- HTTP: GET `/v1/auth`
- Access: r (admin or user with site access)
- Returns: JSON object: `{ loginname, name, company?, cities: [{ name, citycode?, locations: [{ locationid, name, type }] }] }`

#### Transactions

**getTransactionsForCity**
- Description: Raw transactions (checkins/checkouts/overlap) for all locations in a city; default period is previous calendar month unless `from`/`to` provided
- HTTP: GET `/v1/citycodes/{citycode}/transactions`
- Access: r (authorized for given city)
- Query Params:
  - `year` (numeric) optional
  - `month` (numeric) optional
  - `from` (date string) optional (ISO 8601 or custom)
  - `to` (date string) optional
  - `type` (string) optional, default `checkout` (values: `checkin`, `checkout`, `overlap`)
- Returns: JSON `{ defaults, locationids, data: [...], count, type, ...echoed params }`

**getTransactionsForBikepark**
- Description: Raw transactions for a specific location; default period is previous calendar month unless `from`/`to` provided
- HTTP: GET `/v1/citycodes/{citycode}/locations/{locationid}/transactions`
- Access: r (authorized for location)
- Query Params: same as city variant
- Returns: JSON `{ defaults, data: [...], count, type, ...echoed params }`

Data Source (both): internal `variables.reportsUtilityJson.ruweData(...)` with parameters `{ citycode/locationid, startDate, endDate, timeShiftInMinutes, type, showSectionId? }`.

#### Occupation (Bezetting)

**getOccupationForCity**
- Description: Occupation time series for all locations in a city; default period is previous calendar month unless `from`/`to` provided
- HTTP: GET `/v1/citycodes/{citycode}/occupation`
- Access: r (authorized for city)
- Query Params:
  - `year`, `month`, `from`, `to` (same semantics as transactions)
  - `fillups` (boolean-like presence) optional – include filled up records
- Returns: JSON `{ locations: [...], count, defaults: { interval: 15, checkins: 0, checkouts: 0 }, locationids, ...echoed params }`

**getOccupationForBikepark**
- Description: Occupation time series for a specific location; default period is previous calendar month unless `from`/`to` provided
- HTTP: GET `/v1/citycodes/{citycode}/locations/{locationid}/occupation`
- Access: r (authorized for location)
- Query Params: same as city variant
- Returns: JSON `{ locations: [...], count, defaults: { interval: 15, checkins: 0, checkouts: 0 }, ...echoed params }`

**getOccupationForSections**
- Description: Occupation time series grouped by section for a specific location; default period is previous calendar month unless `from`/`to` provided
- HTTP: GET `/v1/citycodes/{citycode}/locations/{locationid}/sections/occupation`
- Access: r (authorized for location)
- Query Params: `year`, `month`, `from`, `to`, `fillups`
- Returns: JSON `{ data: [...], count, ...echoed params }`

All occupation endpoints use `variables.reportsUtilityJson.bezetting(...)` with parameters `{ citycode?, locationid, startDate, endDate, timeShiftInMinutes, fillups, groupBySection }`.

## Internal structure ##

- Component: `broncode/remote/REST/reporting/v1_reportingservice.cfc` (REST, `restpath=/v1`)
- Helper utilities: `nl.fietsberaad.util.reports_json` (exposed as `variables.reportsUtilityJson`)
- Authorization: `checkRights(council|bikepark, prepareHeaders=true)`
  - Admin shortcut: `GetUserRoles() == "admin"`
  - Non-admin: presence of accessible cities/locations via `getLocationsForUser`
  - On failure: throws, and if `prepareHeaders` true, sets 401 headers
- Error handling: `generateError(message)` returns `{ status: 0, message }`
- Date parsing: `application.helperclass.convertDate(<string>)`
- Domain accessors: `application.service.getCouncilByZipId`, `getBikeparkByExternalID`

## Notes ##

- Default period: If no `from`/`to`, endpoints use previous calendar month `[YYYY-MM-01 00:00:00, next month)`.
- Section visibility: `getTransactionsForBikepark` may include `sectionid` in defaults when a location has a single section.
- Types: The `type` filter for transactions supports `checkin`, `checkout`, `overlap`.
- Response shapes are JSON objects optimized for reporting UIs; counts are included for convenience.

## API V2 services ##

### authentication ###

V2 reporting endpoints also use HTTP Basic Authentication. For V2 occupation, outputs follow the “datastandaard” schema and broaden filtering and paging.

- Admin has full access; read endpoints are open to authenticated users with access to locations; write endpoints do not exist in reporting V2
- CORS headers are enabled (`Access-Control-Allow-Origin: *`) on V2 reporting components

### API methods ###

#### Occupation Data (Datastandaard-flavored)

Component: `broncode/remote/REST/reporting/v2_occupation.cfc` (restpath `/v2/occupation`)

- getOrganisations
  - HTTP: GET `/v2/occupation/organisations`
  - Description: List known contractor/organisation identifiers (plus surveys)
  - Returns: `{ result: [{ id, name }, ...] }`

- getOrganisation
  - HTTP: GET `/v2/occupation/organisations/{organisationid}`
  - Description: Get organisation by id
  - Returns: `{ id, name? }`

- getAuthorities
  - HTTP: GET `/v2/occupation/authorities`
  - Description: Authorities inferred from static data (councils)
  - Returns: `{ result: [{ id, name }, ...] }`

- getAuthority
  - HTTP: GET `/v2/occupation/authorities/{authorityId}`
  - Description: Authority by id (council zipId)
  - Returns: `{ id, name }`

- getSurveys
  - HTTP: GET `/v2/occupation/surveys`
  - Description: List surveys (mapped from councils)
  - Returns: `{ result: [{ id, name, authorityId }, ...] }`

- getSurvey
  - HTTP: GET `/v2/occupation/surveys/{surveyId}`
  - Description: Survey by id

- getStaticData (preferred)
  - HTTP: GET `/v2/occupation/static`
  - Query: `staticSectionId?`, `surveyId?`, `contractorId?`, `authorityId?`, `geopolygon?`, `georelation?`, `exclude?`, `include?`
  - Description: Returns static sections (parking locations) available to the user
  - Returns: `{ result: [ { id, name, geoLocation?, contractorIds[], authorityIds[], surveyIds[] }... ], totalHits }`

- getDynamicData (time series)
  - HTTP: GET `/v2/occupation/dynamic`
  - Query: `staticSectionId?`, `surveyId?`, `contractorId?`, `authorityId?`, `depth=1|2`, `startDate?`, `endDate?`, `page?`, `pageSize?`, `orderBy?`, `orderDirection?`, `groupBy? (staticSectionId)`
  - Description: Occupation time series (optionally grouped by section when `depth>1`)
  - Returns: time-series structure from `reports_json_datastandaard.bezetting(...)`

- Deprecated aliases
  - GET `/v2/occupation/staticdata` → use `/static`
  - GET `/v2/occupation/dynamicdata` → use `/dynamic`

Internals:
- Uses `nl.fietsberaad.util.reports_json_datastandaard` for data
- Default page sizes: static: 9999; dynamic: 1000

#### Subscriptions Overview

Component: `broncode/remote/REST/reporting/subscriptions.cfc` (restpath `/v2/subscriptions`)

- getSubscriptionsForCity
  - HTTP: GET `/v2/subscriptions`
  - Description: Returns active and paid subscriptions visible to the current user across their accessible locations
  - Returns: array of `{ citycode, price, mollie?, account{ email, name }, valid{ from, through }, subscriptiontype, identifaction{ type, id } }`

### Internal structure (V2) ###
- Shared auth and base behaviors extend V1 (`extends="./v1_reportingservice"`)
- Occupation V2 uses datastandard-flavored utility `reports_json_datastandaard`
- CORS enabled; error responses as `{ error: message }` for many endpoints
