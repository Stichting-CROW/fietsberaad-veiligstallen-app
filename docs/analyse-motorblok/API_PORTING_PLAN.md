# API Porting and Transaction Processing Plan (Merged)

**Version:** 1.0  
**Created:** 2026-02  
**Status:** Draft – assumes prior implementation was reverted; codebase may have changed since original plans.

**Supersedes (kept for reference):**
- `~/.cursor/plans/api_porting_and_transaction_processing_c799dce3.plan.md`
- `~/.cursor/plans/api_porting_and_transaction_processing_5102f520.plan.md`

---

## Scope

- **REST only** – no SOAP, no legacy FMS V1/V2/V3 API formats
- **New REST design** – FMS operations exposed as REST endpoints, not literal port of ColdFusion formats
- **Transaction processing backend** – queue processing and business logic

**Separate plan:** Datastandard and Reporting APIs – see [DATASTANDARD_REPORTING_API_PLAN.md](DATASTANDARD_REPORTING_API_PLAN.md).

---

## Phase 1: Foundation and Infrastructure

### 1.1 API Route Structure

Create base structure (verify paths against current codebase):

- `/src/pages/api/fms/` – FMS REST endpoints (transactions, bikes, saldo, sync)

### 1.2 Authentication

- HTTP Basic Authentication middleware
- Integrate with NextAuth and `fmsservice_permit`
- Roles: `operator`, `dataprovider.type1`, `dataprovider.type2`, `admin`

### 1.3 Shared Utilities

- Response formatters
- Error handling
- Date parsing (ISO 8601 and custom formats)
- JSON serialization

### 1.4 Swagger/OpenAPI

- OpenAPI 3.0 specs
- Swagger UI route (e.g. `/api/docs`)
- Security scheme: HTTP Basic Auth

---

## Phase 2: FMS REST API

**Reference:** [docs/analyse-motorblok/wachtrij-tables-api-methods.md](wachtrij-tables-api-methods.md) – only REST is used; SOAP/CFC remote is deprecated.

### 2.1 Endpoints (REST design)

| Operation | Method | Path (example) | Queue table |
|-----------|--------|----------------|-------------|
| Upload transaction | POST | `/api/fms/sections/{sectionid}/transactions` | wachtrij_transacties |
| Upload transactions (bulk) | POST | `/api/fms/sections/{sectionid}/transactions/bulk` | wachtrij_transacties |
| Save bike | POST | `/api/fms/bikes` | wachtrij_pasids |
| Save bikes (bulk) | POST | `/api/fms/bikes/bulk` | wachtrij_pasids |
| Add saldo | POST | `/api/fms/saldo` | wachtrij_betalingen |
| Add saldos (bulk) | POST | `/api/fms/saldo/bulk` | wachtrij_betalingen |
| Sync sector | POST | `/api/fms/sync` | wachtrij_sync |

### 2.2 Read-only Endpoints

- Bike types, client types, payment types
- Sectors, subscription types
- Locker info, server time

### 2.3 Implementation

- Validate request body (e.g. Zod)
- Insert into queue tables (`wachtrij_*`)
- Return JSON responses
- Log to `webservice_log` where applicable

---

## Phase 3: Transaction Processing Backend

### 3.1 Queue Processing Service

**Location:** `/src/server/services/queue/processor.ts`

| Queue | Batch size | Logic |
|-------|------------|-------|
| wachtrij_pasids | 50 | Link bikes to passes |
| wachtrij_transacties | 50 | 3-step locking, create transactions |
| wachtrij_betalingen | 200 | Update account balances |
| wachtrij_sync | 1 | Sector sync |

### 3.2 Scheduler

- Endpoint callable via cron (e.g. `/api/cron/process-queues`)
- Process queues in sequence
- Error handling and status updates
- Email alerts for financial errors

### 3.3 Business Logic Services

- `bikeparkService` – getBikeparkByExternalID, etc.
- `transactionService` – uploadTransactionObject
- `accountService` – addSaldoObject, balance updates
- `subscriptionService` – subscription management
- `lockerService` – locker operations

### 3.4 Transaction Flow

**Reference:** [docs/analyse-motorblok/stroomdiagram-stallingstransacties_v2.md](stroomdiagram-stallingstransacties_v2.md)

#### Check-In

1. Validate bikepark, section, passID
2. Check for open transaction
3. Create record in `transacties` (Date_checkin, Type_checkin, PasID, etc.)
4. Update `accounts_pasids` (huidigeFietsenstallingId, huidigeSectieId)

#### Check-Out

1. Find open transaction (PasID, Date_checkout IS NULL)
2. Calculate Stallingsduur and Stallingskosten (tariff rules)
3. Update account balance, create `financialtransactions`
4. Update `transacties` (Date_checkout, Stallingsduur, Stallingskosten)
5. Update `accounts_pasids` (clear current parking)

#### Special Cases

- Sync transactions (Type_checkout = 'sync')
- Overlap (force checkout of previous)
- Locker transactions (PlaceID, fietsenstalling_plek)

#### Error Handling

- Prisma `$transaction()` for atomicity
- Rollback on failure
- Reconciliation for orphaned/inconsistent data

### 3.5 Archive Process

- Archive processed queue records
- Daily archive tables (`wachtrij_*_archive{yyyymmdd}`)

---

## Phase 4: Swagger Documentation

- OpenAPI specs for FMS REST API
- Swagger UI integration
- Optional: code generation from specs

---

## Phase 5: Testing

- Unit tests for queue processing
- Integration tests for FMS APIs
- Validation against ColdFusion reference where possible

---

## Phase 6: Documentation

- Implementation status
- API migration guide
- Queue processing documentation

---

## Implementation Order

1. Phase 1 – Foundation
2. Phase 3 – Transaction processing (core backend)
3. Phase 2 – FMS REST API
4. Phase 4 – Swagger (in parallel)
5. Phase 5 – Testing
6. Phase 6 – Documentation

---

## Key References

| Document | Purpose |
|----------|---------|
| **FMS API Next.js Migration plan** | Cursor plan: Next.js port of FMS V1/V2/V3, duplicate tables, Data\|API page, test gemeente, Swagger |
| [SERVICES_FMS.md](SERVICES_FMS.md) | FMS API behaviour (ColdFusion reference) |
| [DATASTANDARD_REPORTING_API_PLAN.md](DATASTANDARD_REPORTING_API_PLAN.md) | Datastandard and Reporting APIs (separate plan) |
| [wachtrij-tables-api-methods.md](wachtrij-tables-api-methods.md) | Which REST methods write to queue tables |
| [wachtrij-transactie-processing-stappen.md](wachtrij-transactie-processing-stappen.md) | Queue processing steps |
| [stroomdiagram-stallingstransacties_v2.md](stroomdiagram-stallingstransacties_v2.md) | Transaction flow diagram |
| [FMSservice-rest_v3.0.4.pdf](../documentatie-crow/1-api/FMSservice-rest_v3.0.4.pdf) | Official CROW FMS REST API v3 documentation |
| [conversations.md](conversations.md) | Cursor chat transcripts |

---

## Assumptions

- Prior implementation from older plans has been reverted
- Current codebase may differ from when original plans were written
- ColdFusion REST API remains the behavioural reference
- SOAP/CFC remote is not supported
