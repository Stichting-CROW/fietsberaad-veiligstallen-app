# Datastandard and Reporting API Plan

**Version:** 1.0  
**Created:** 2026-02  
**Status:** Draft – implemented separately from FMS/transaction processing.

**Related plan:** [API_PORTING_PLAN.md](API_PORTING_PLAN.md) – FMS REST API and transaction processing.

---

## Scope

- **Datastandard REST API v2** – organisations, surveys, parking locations, observations
- **Reporting API v1/v2** – transactions and occupation data
- **REST only** – Swagger/OpenAPI documentation
- Implemented as a separate effort from the FMS and transaction processing work

---

## Phase 1: Foundation

### 1.1 API Route Structure

- `/src/pages/api/datastandard/v2/` – Datastandard endpoints
- `/src/pages/api/reporting/v1/` – Reporting V1
- `/src/pages/api/reporting/v2/` – Reporting V2

### 1.2 Authentication

- HTTP Basic Authentication (or reuse from FMS plan if already in place)
- Integrate with NextAuth and permissions
- Roles: `dataprovider`, `admin`, etc. (see SERVICES_* docs)

### 1.3 Swagger/OpenAPI

- OpenAPI 3.0 specs for Datastandard and Reporting
- Swagger UI integration
- Security scheme: HTTP Basic Auth

---

## Phase 2: Datastandard REST API v2

**Reference:** [SERVICES_DATASTANDARD.md](SERVICES_DATASTANDARD.md)

### 2.1 Resources

| Resource | Methods | Path (relative to /v2) |
|----------|---------|------------------------|
| Auth/Permissions | GET | `/auth`, `/permissions` |
| Organisations | GET, POST(403), DELETE(403) | `/organisations`, `/organisations/{id}` |
| Surveys | GET, POST, PUT, DELETE | `/surveys`, `/surveys/{id}` |
| Survey Areas | GET, POST, PUT, DELETE | `/survey-areas`, `/surveys/{id}/survey-areas`, etc. |
| Parking Locations | GET, POST, PUT, DELETE | `/parking-locations`, etc. |
| Sections | GET, POST, PUT, DELETE | `/sections`, `/sections/{id}` |
| Canonical Vehicle Categories | GET, POST, DELETE | `/canonical-vehicle-categories`, etc. |
| Canonical Vehicles | GET, POST, PUT, DELETE | `/canonical-vehicle-categories/{id}/canonical-vehicles`, etc. |
| Observations | GET, POST, DELETE | `/observations`, `/observations/{id}` |

### 2.2 Implementation

- REST resource paths
- Query params: `offset`, `limit`, `orderBy`, `orderDirection`
- Geospatial filtering: `geopolygon`, `georelation`
- Write operations require `dataprovider` or `admin` role

---

## Phase 3: Reporting API

**Reference:** [SERVICES_REPORTING.md](SERVICES_REPORTING.md)

### 3.1 V1 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/auth` | GET | Locations for current user |
| `/v1/citycodes/{citycode}/transactions` | GET | City transactions |
| `/v1/citycodes/{citycode}/locations/{locationid}/transactions` | GET | Location transactions |
| `/v1/citycodes/{citycode}/occupation` | GET | City occupation |
| `/v1/citycodes/{citycode}/locations/{locationid}/occupation` | GET | Location occupation |
| `/v1/citycodes/{citycode}/locations/{locationid}/sections/occupation` | GET | Section occupation |

**Query params:** `year`, `month`, `from`, `to`, `type` (checkin/checkout/overlap)

### 3.2 V2 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/occupation/organisations` | GET | List organisations |
| `/v2/occupation/organisations/{id}` | GET | Get organisation |
| `/v2/occupation/authorities` | GET | List authorities |
| `/v2/occupation/authorities/{id}` | GET | Get authority |
| `/v2/occupation/surveys` | GET | List surveys |
| `/v2/occupation/surveys/{id}` | GET | Get survey |
| `/v2/occupation/static` | GET | Static data |
| `/v2/occupation/dynamic` | GET | Dynamic data |
| `/v2/subscriptions` | GET | Subscriptions for city |

### 3.3 Implementation

- Reuse reporting utilities from `/src/backend/services/reports/` where applicable
- Default period: previous calendar month if no dates provided
- CORS headers for V2
- Pagination and filtering

---

## Phase 4: Swagger Documentation

- OpenAPI specs for Datastandard v2
- OpenAPI specs for Reporting v1 and v2
- Integrate with Swagger UI
- Optional: code generation from specs

---

## Phase 5: Testing and Documentation

- Integration tests for API endpoints
- API migration guide
- Implementation status document

---

## Implementation Order

1. Phase 1 – Foundation
2. Phase 2 – Datastandard API
3. Phase 3 – Reporting API
4. Phase 4 – Swagger
5. Phase 5 – Testing and documentation

---

## Key References

| Document | Purpose |
|----------|---------|
| [SERVICES_DATASTANDARD.md](SERVICES_DATASTANDARD.md) | Datastandard API specification |
| [SERVICES_REPORTING.md](SERVICES_REPORTING.md) | Reporting API specification |
| [API_PORTING_PLAN.md](API_PORTING_PLAN.md) | FMS and transaction processing (separate plan) |
