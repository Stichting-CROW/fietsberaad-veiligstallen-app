# NS API Gateway Integration Documentation

## Overview
This document describes how the NS (Nederlandse Spoorwegen) API gateway is called and how the response data is processed in the ColdFusion backend codebase.

## When the Gateway is Called

### Execution Trigger
The NS API gateway is called via the cronjob file: `broncode/remote/cronjobs/externalAPIs.cfm`

### Scheduling Logic

The cronjob supports two execution modes:

#### 1. Daily Execution Mode (`getDaily() = true`)
- **Frequency**: Once per day
- **Start Time**: From 3:30 AM onwards
- **Execution Window**: Runs when:
  - Current time is after 3:30 AM
  - AND minute of current hour MOD 10 ≤ 1 (runs at :00, :01, :10, :11, :20, :21, etc.)
  - AND either:
    - No previous request timestamp exists, OR
    - Last request was ≥ 23 hours ago
  - OR `?forceevents` URL parameter is present (manual trigger)

#### 2. Interval-Based Execution Mode (`getDaily() = false`)
- **Frequency**: Based on configured interval (in minutes)
- **Execution Condition**: Runs when:
  - No previous request timestamp exists, OR
  - Time since last request ≥ configured interval
  - OR `?force` URL parameter is present (manual trigger)

### Execution Flow

1. **Cronjob Entry Point** (`externalAPIs.cfm`):
   - Loops through all external APIs retrieved via `application.service.getExternalApis()`
   - For each external API that has locations (`hasExternalApiLocations()`):
     - Determines execution mode (daily vs interval-based)
     - Checks if execution conditions are met
     - Retrieves connector instance via `externalApi.getConnector()`
     - Calls `connector.execute()`

2. **Connector Instantiation** (`ExternalApi.cfc`):
   - Creates connector instance using the `Class` property from database
   - For NS: Creates `nl.fietsberaad.connector.ns.NsLocationConnector`
   - Sets the external API reference on the connector

## How the Output is Processed

### API Call Execution (`NsLocationConnector.cfc`)

#### Step 1: Execute Method
The `execute()` method calls two endpoints sequentially:
1. **Fietskluizen**: `executeEndpoint(this.query_params_fietskluizen)`
2. **Stationsstallingen**: `executeEndpoint(this.query_params_stallingen)`

#### Step 2: HTTP Request (`getLocations()` method)
- **Endpoint**: `https://gateway.apiportal.ns.nl/places-api/v2/places`
- **Method**: GET
- **Headers**: 
  - `Ocp-Apim-Subscription-Key: 7485dd10a8cc493bacbcf64ed8965733`
- **Query Parameters**:
  - For fietskluizen: `type=stationfacility&radius=1000&name=fietskluis&limit=250`
  - For stallingen: `type=stationfacility&radius=1000&identifier=fietsenstalling&limit=250`
- **Response**: JSON payload is deserialized: `DeSerializeJSON(r.filecontent).payload`

#### Step 3: Response Processing (`executeEndpoint()` method)

The response structure is expected to be an array of objects, where each object has:
- `name`: Facility type name
- `locations`: Array of location objects

**Processing Loop Structure**:
```
For each type in result array:
  For each location in type.locations array:
    Process location data
```

#### Step 4: Type Mapping

The facility type name (`type.name`) is mapped to bikepark types:

| NS Facility Type | Bikepark Type | External ID Prefix |
|-----------------|---------------|-------------------|
| "Bemenste fietsenstalling" | "bewaakt" | "bwt" |
| "Zelfservice fietsenstalling" | "geautomatiseerd" | "aut" |
| "Fietskluis" | "fietskluizen" | "fkl" |

#### Step 5: Location Processing

For each location in the response:

1. **External ID Generation**:
   - Extracts ID from `location.link.uri` (last part after "-")
   - If numeric, prefixes with type prefix: `"{prefix}-{id}"`
   - Example: `"fkl-12345"` for fietskluis #12345

2. **Bikepark Lookup/Creation**:
   - Attempts to find existing bikepark by external ID: `council.getBikeparkByExternalID(externalId)`
   - If not found (exception caught), creates new bikepark:
     - Sets council to "ns" (via `getCouncilByUrlName("ns")`) → `SiteID`
     - Sets exploitant to "ns-stations" if it exists → `ExploitantID`
     - Sets `IsStationsstalling = true`
     - Sets `Status = "1"` (active)
     - Sets `Beheerder = "NS Fiets"`
     - Sets `BeheerderContact = "www.nsfiets.nl"`
     - Sets `EditorCreated = "NS-connector"`
     - Sets `DateCreated = now()`
     - Sets `StallingsIDExtern = externalId` (with prefix)

3. **Data Mapping** (applied to both new and existing bikeparks):

   | NS API Field | Prisma Schema Field | Notes |
   |--------------|---------------------|-------|
   | `location.lat, location.lng` | `Coordinaten` | Combined as "lat,lng" |
   | `location.name` | `Title` | |
   | `location.description` | `Description` | Empty string if not present |
   | `location.openinghours[]` | `Open_ma` through `Open_zo`<br>`Dicht_ma` through `Dicht_zo` | Maps `dayOfWeek` (1-7) to Mo-Su, sets startTime and endTime |
   | `location.infoImages[0].link.uri` | `Image` | First image URL, empty if none |
   | `location.extra.regime` | `NotaVerwijssysteem` | Also sets `Tariefcode = 1` if regime = "betaald" |
   | `location.postalCode` | `Postcode` | Empty string if not present |
   | `location.city` | `Plaats` | Empty string if not present |
   | `location.street` + `location.houseNumber` | `Location` | Combined as "street houseNumber" or just "street" |

4. **Standard Fields Set** (applied to both new and existing bikeparks):
   - `EditorModified = "NS-connector"`
   - `DateModified = now()`
   - `Type = {mapped bikepark type}` (references `fietsenstallingtypen.id`)
   - `FMS = false`
   - `IsPopup = false`

5. **Save Operation**:
   - Calls `application.service.saveBikepark(bp)` to persist changes

#### Step 6: Error Handling

- **Location-level errors**: Caught per location, logged to database via `mailcontroller.toDB()` with error type
- **API call errors**: Propagated up to cronjob level, output to console

### Data Flow Summary

```
Cronjob (externalAPIs.cfm)
  ↓
ExternalApi.getConnector() → NsLocationConnector
  ↓
connector.execute()
  ↓
executeEndpoint(fietskluizen) → getLocations() → HTTP GET → JSON Response
  ↓
Process each location:
  - Extract external ID
  - Find or create bikepark
  - Map NS fields to bikepark properties
  - Save bikepark
  ↓
executeEndpoint(stallingen) → (same process)
```

## Key Files

- **Cronjob**: `broncode/remote/cronjobs/externalAPIs.cfm`
- **Connector**: `broncode/cflib/nl/fietsberaad/connector/ns/NsLocationConnector.cfc`
- **Model**: `broncode/cflib/nl/fietsberaad/model/bikepark/ExternalApi.cfc`
- **Service**: `broncode/cflib/nl/fietsberaad/service/BikeparkServiceImpl.cfc`

## Configuration

External API configuration is stored in the `externe_apis` database table with fields:
- `Name`: Display name
- `Class`: Connector class path (e.g., "nl.fietsberaad.connector.ns.NsLocationConnector")
- `Interval`: Minutes between runs (for non-daily APIs)
- `Daily`: Boolean flag for daily execution mode
- `LastRequest`: Timestamp of last execution

## Notes

- The connector processes **both** fietskluizen and stationsstallingen in a single execution
- All NS-synced bikeparks are marked with `IsStationsstalling = true`
- The external ID prefix ensures uniqueness across different facility types
- Opening hours are dynamically mapped using `Evaluate()` to call the appropriate setter methods
- Errors are logged but don't stop processing of other locations

