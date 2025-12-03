# Flow Map: Transaction with typeCheck=controle

This document maps the complete flow when a transaction with `typeCheck=controle` is entered via the API, including all tables updated and the order of operations.

## Overview

Controle transactions are special transactions used for system checks and validations. They follow a similar flow to regular transactions but have specific timing logic and may trigger tariff rule cleanup.

## Entry Point: API

**API Endpoint**: `uploadTransaction` or `uploadJsonTransaction` (ColdFusion FMS API)

**Initial Table Write**: `wachtrij_transacties`
- Transaction is queued with `typeCheck='controle'` (or `typeCheck='Controle'`)
- Status: `processed = 0` (pending)
- Fields stored:
  - `transactionDate` - When the transaction occurred
  - `bikeparkID` - The bike parking facility ID
  - `sectionID` - Section within the bike parking
  - `passID` - Pass/key fob identifier
  - `type` - "IN" or "OUT"
  - `typeCheck` - "controle" (or "Controle")
  - `price` - Transaction price (if any)
  - `transaction` - JSON serialized transaction object
  - `dateCreated` - Queue entry timestamp

## Processing Pipeline

The transaction is processed by the ColdFusion scheduler (`processTransactions2.cfm`) which follows a 3-step selection process:

### Step 1: Mark for Processing
```sql
UPDATE wachtrij_transacties 
SET processed = 9 
WHERE processed = 0 
AND transactionDate <= now() 
ORDER BY transactionDate, type 
LIMIT 50
```

### Step 2: Retrieve Marked Records
```sql
SELECT * FROM wachtrij_transacties 
WHERE processed = 9 
ORDER BY transactionDate, type
```

### Step 3: Lock Records
```sql
UPDATE wachtrij_transacties 
SET processed = 8 
WHERE processed = 9
```

## Processing Logic: uploadTransactionObject

For each controle transaction, the system calls `application.service.uploadTransactionObject(transaction, bikepark)` which performs the following operations:

### 1. Transaction Record Creation/Update in `transacties` Table

**For CHECK-IN (type='IN') with typeCheck='controle':**
- **INSERT** new record in `transacties` table with:
  - `Type_checkin = 'controle'` (or `'Controle'`)
  - `Date_checkin` = `transactionDate` (or adjusted if duration is 0: `transactionDate - 3 hours`)
  - `PasID` = from transaction
  - `FietsenstallingID` = bikepark ID
  - `SectieID` = section ID
  - `BarcodeFiets_in` = bike barcode (if present)
  - Other standard transaction fields

**For CHECK-OUT (type='OUT') with typeCheck='controle':**
- **UPDATE** existing transaction record in `transacties` table:
  - Find matching open transaction (same `PasID`, `Date_checkin <= transactionDate`, `Type_checkout` is NULL or 'system' or 'sync')
  - **UPDATE** with:
    - `Type_checkout = 'controle'` (or `'Controle'`)
    - `Date_checkout` = `Date_checkin + 3 hours` (special controle timing logic)
    - `Stallingsduur` = calculated duration
    - `SectieID_uit` = section ID (if different from check-in)

**Special Timing Logic for Controle:**
- If `TypeCheckOUT = 'controle'`: `DateCheckOUT` is set to `CheckInTime + 3 hours`
- If `TypeCheckin = 'controle'` and duration is 0: `DateCheckin` is adjusted to `transactionDate - 3 hours`

### 2. Update `accounts_pasids` Table

**For CHECK-IN:**
- **UPDATE** or **INSERT** record in `accounts_pasids`:
  - `PasID` = pass identifier
  - `huidigeFietsenstallingId` = bikepark ID
  - `huidigeSectieId` = section ID
  - `dateLastCheck` = transaction date

**For CHECK-OUT:**
- **UPDATE** record in `accounts_pasids`:
  - `huidigeFietsenstallingId` = NULL
  - `huidigeSectieId` = NULL
  - `dateLastCheck` = transaction date

### 3. Update `accounts` Table (if price > 0)

**Only if transaction has a price:**
- **UPDATE** `accounts` table:
  - Find account by `PasID`
  - **UPDATE** `Saldo` (balance) = `Saldo - price`
  - Record balance change

### 4. Create `financialtransactions` Record (if price > 0)

**Only if transaction has a price:**
- **INSERT** new record in `financialtransactions`:
  - `accountID` = account ID
  - `amount` = transaction price
  - `transactionDate` = transaction date
  - `transactionID` = reference to `transacties.ID`
  - `bikeparkID` = bikepark ID
  - `sectionID` = section ID
  - `status` = transaction status
  - Other financial fields

### 5. Tariff Rules Cleanup (`tariefregels`)

**Condition**: If both `Type_checkin` AND `Type_checkout` are either "user" OR "controle"

**Action**: **DELETE** tariff rules (`tariefregels`) associated with the modified transaction(s)

This cleanup happens when:
- A transaction is updated (check-out completes a check-in)
- Both check-in and check-out types are "user" or "controle"
- The system removes tariff rules that were linked to these transactions

**Note**: Based on the flow diagram, this deletion occurs in a "koppeltabel" (junction table), suggesting there may be a relationship table linking transactions to tariff rules.

## Success Handling

After successful processing:
- **UPDATE** `wachtrij_transacties`:
  - `processed = 1` (success)
  - `processDate = now()`

## Error Handling

If processing fails:
- **UPDATE** `wachtrij_transacties`:
  - `processed = 2` (error)
  - `error` = exception message
  - `processDate = now()`
- **Email alert** sent if `price > 0` (financial transactions get priority notification)

## Table Update Order Summary

1. **`wachtrij_transacties`** - Mark as processing (`processed = 8`)
2. **`transacties`** - INSERT (check-in) or UPDATE (check-out)
3. **`accounts_pasids`** - UPDATE current parking status
4. **`accounts`** - UPDATE balance (if price > 0)
5. **`financialtransactions`** - INSERT financial record (if price > 0)
6. **`tariefregels`** - DELETE tariff rules (if both typeCheckin and typeCheckout are "user" or "controle")
7. **`wachtrij_transacties`** - Mark as processed (`processed = 1`)

## Archive Process

Processed transactions are eventually archived:
- Daily archive table created: `wachtrij_transacties_archive{yyyymmdd}`
- Processed records moved to archive (except those with `processed IN (0,8,9)`)
- Archive process runs via `archiveWachtrijTransacties.cfm`

## Key Differences: Controle vs Regular Transactions

1. **Timing Logic**: Controle transactions have special 3-hour timing adjustments
2. **Type Fields**: `Type_checkin` or `Type_checkout` set to "controle" instead of "user"
3. **Tariff Cleanup**: May trigger tariff rule deletion when both check-in and check-out are controle
4. **No Financial Impact**: Typically controle transactions have `price = 0`, so no account balance or financial transaction updates

## Related Tables Structure

### `transacties` Table Fields (relevant to controle):
- `Type_checkin` VARCHAR(40) - Set to 'controle' for controle check-ins
- `Type_checkout` VARCHAR(40) - Set to 'controle' for controle check-outs
- `Date_checkin` DATETIME - May be adjusted for controle transactions
- `Date_checkout` DATETIME - Set to `Date_checkin + 3 hours` for controle check-outs

### `wachtrij_transacties` Table Fields:
- `typeCheck` VARCHAR(60) - Contains 'controle' for controle transactions
- `type` VARCHAR(10) - 'IN' or 'OUT'
- `processed` BOOLEAN - Processing status

## References

- Flow diagram: `docs/stroomdiagram-stallingstransacties_v2.svg`
- API documentation: `SERVICES_FMS.md`
- Database schema: `prisma/schema.prisma`

