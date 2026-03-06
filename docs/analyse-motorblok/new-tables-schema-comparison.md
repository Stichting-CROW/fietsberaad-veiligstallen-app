# new_* vs Original Tables – Schema Comparison

Comparison of `new_*` tables with their original counterparts for 1-1 identity.

---

## wachtrij_transacties ↔ new_wachtrij_transacties

| Column | Original | new_* | Match |
|--------|----------|-------|-------|
| ID | Int @id @default(autoincrement()) | Int @id @default(autoincrement()) | ✓ |
| transactionDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| bikeparkID | String @db.VarChar(8) | String @db.VarChar(8) | ✓ |
| sectionID | String @db.VarChar(13) | String @db.VarChar(13) | ✓ |
| placeID | Int? | Int? | ✓ |
| externalPlaceID | String? @db.VarChar(100) | String? @db.VarChar(100) | ✓ |
| transactionID | Int @default(0) | Int @default(0) | ✓ |
| passID | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| passtype | String? @db.VarChar(20) | String? @db.VarChar(20) | ✓ |
| type | String @db.VarChar(10) | String @db.VarChar(10) | ✓ |
| typeCheck | String? @db.VarChar(60) | String? @db.VarChar(60) | ✓ |
| price | Decimal? @db.Decimal(5, 2) | Decimal? @db.Decimal(5, 2) | ✓ |
| transaction | String @db.Text | String @db.Text | ✓ |
| processed | Int @default(0) @db.TinyInt | Int @default(0) @db.TinyInt | ✓ |
| processDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| error | String? @db.Text | String? @db.Text | ✓ |
| dateCreated | DateTime @default(now()) @db.Timestamp(0) | DateTime @default(now()) @db.Timestamp(0) | ✓ |

**Indexes:** Same structure (map names differ: new_wt_* vs original). ✓

---

## wachtrij_pasids ↔ new_wachtrij_pasids

| Column | Original | new_* | Match |
|--------|----------|-------|-------|
| ID | Int @id @default(autoincrement()) | Int @id @default(autoincrement()) | ✓ |
| transactionDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| bikeparkID | String @db.VarChar(8) | String @db.VarChar(8) | ✓ |
| passID | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| barcode | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| RFID | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| RFIDBike | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| biketypeID | Int? | Int? | ✓ |
| bike | String @db.Text | String @db.Text | ✓ |
| processed | Int @default(0) @db.TinyInt | Int @default(0) @db.TinyInt | ✓ |
| processDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| error | String? @db.Text | String? @db.Text | ✓ |
| DateCreated | DateTime @default(now()) @db.Timestamp(0) | DateTime @default(now()) @db.Timestamp(0) | ✓ |

**Indexes:** Same structure. ✓

---

## wachtrij_betalingen ↔ new_wachtrij_betalingen

| Column | Original | new_* | Match |
|--------|----------|-------|-------|
| ID | Int @id @default(autoincrement()) | Int @id @default(autoincrement()) | ✓ |
| bikeparkID | String @db.VarChar(8) | String @db.VarChar(8) | ✓ |
| passID | String @db.VarChar(35) | String @db.VarChar(35) | ✓ |
| idtype | Int? | Int? | ✓ |
| transactionDate | DateTime @db.DateTime(0) | DateTime @db.DateTime(0) | ✓ |
| paymentTypeID | Int | Int | ✓ |
| amount | Decimal @db.Decimal(8, 2) | Decimal @db.Decimal(8, 2) | ✓ |
| processed | Int @default(0) @db.TinyInt | Int @default(0) @db.TinyInt | ✓ |
| processDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| error | String? @db.Text | String? @db.Text | ✓ |
| dateCreated | DateTime @default(now()) @db.Timestamp(0) | DateTime @default(now()) @db.Timestamp(0) | ✓ |

**Indexes:** Same (both have @@unique, neither has index on processed). ✓

---

## wachtrij_sync ↔ new_wachtrij_sync

| Column | Original | new_* | Match |
|--------|----------|-------|-------|
| ID | Int @id @default(autoincrement()) | Int @id @default(autoincrement()) | ✓ |
| bikes | String @db.LongText | String @db.LongText | ✓ |
| bikeparkID | String @db.VarChar(8) | String @db.VarChar(8) | ✓ |
| sectionID | String @db.VarChar(13) | String @db.VarChar(13) | ✓ |
| transactionDate | DateTime? @db.DateTime(0) | DateTime? @db.DateTime(0) | ✓ |
| processed | Int @default(0) | Int @default(0) | ✓ |
| processDate | DateTime? @db.Timestamp(0) | DateTime? @db.Timestamp(0) | ✓ |
| error | String? @db.Text | String? @db.Text | ✓ |
| dateCreated | DateTime @default(now()) @db.Timestamp(0) | DateTime @default(now()) @db.Timestamp(0) | ✓ |

**Indexes:** Same structure. ✓

---

## transacties ↔ new_transacties

Columns and types match. Index map names differ (new_t_* vs original). ✓

---

## accounts ↔ new_accounts

Columns match. `accounts` has `abonnementen` relation; `new_accounts` omits it (no relations to new_*). Index map names differ. ✓

---

## accounts_pasids ↔ new_accounts_pasids

Columns match. `accounts_pasids` has `abonnementen` relation; `new_accounts_pasids` omits it. ✓

---

## financialtransactions ↔ new_financialtransactions

Columns match. Index map names differ. ✓

---

## Summary of Differences

**All tables are now 1-1 identical.** Prisma schema for wachtrij_pasids and wachtrij_betalingen was updated from Boolean to Int to match production (values 0,1,2,8) and new_* tables.
