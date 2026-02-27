# Verwerking wachtrij-transactie (status 8) – gedetailleerde stappen

Dit document beschrijft de zeven stappen die per record worden uitgevoerd wanneer `processTransactions2.cfm` records met `processed=8` verwerkt. Zie `wachtrij-transacties-processing-flow.md` voor het overzicht.

---

## Context

De loop in `processTransactions2.cfm` verwerkt records die:
- al geïsoleerd (9) en vergrendeld (8) zijn
- in de query `q` zitten (uit de SELECT waar processed=9)

Per record worden de kolommen uit het wachtrij-record aangevuld met velden uit de JSON in de kolom `transaction`.

---

## Stap 1: getBikeparkByExternalID(bikeparkID)

**Doel:** Haal het bikepark-object op dat bij de stalling hoort.

**Input:** `bikeparkID` uit het wachtrij-record (bijv. `3500_001`).

**Werking:** Zoekt in de database naar de fietsenstalling met het gegeven externe ID. Het resultaat is een Hibernate-object met stallinggegevens (adres, gemeente, exploitant, sectie, tarieven, etc.).

**Gebruik:** Bepalen van gemeente, sectie, tarieven, place en clientType. Bij fout: exception, record wordt processed=2.

**Bestand:** `application.service.getBikeparkByExternalID` – `BikeparkServiceImpl` of `Council`.

### TypeScript-definitie

```typescript
/** Record uit wachtrij_transacties dat we verwerken (query q) */
interface WachtrijTransactieRecord {
  ID: number;
  transactionDate: string;  // ISO timestamp
  bikeparkID: string;       // e.g. "3500_001"
  sectionID: string;       // e.g. "3500_001_1"
  placeID: number | null;
  externalPlaceID: string | null;
  transactionID: number;   // 0 = geen afboeking
  passID: string;
  passType: PassType;
  price: number | null;
  type: TransactionType;
  typeCheck: TypeCheck;
  transaction: string;      // JSON-string, zie TransactionFromJson (stap 2)
  processed: ProcessedStatus;
  processDate: string | null;
  error: string | null;
  dateCreated: string;
}

type ProcessedStatus = 0 | 1 | 2 | 8 | 9;
type TransactionType = 'In' | 'Uit' | 'Out' | 'Afboeking';
type PassType = 'sleutelhanger' | 'ovchip' | 'barcodebike';
type TypeCheck = 'user' | 'controle' | 'section' | 'sync' | 'reservation' | 'beheer' | 'system';

/** Bikepark-object (Hibernate/ORM, hier als interface) */
interface Bikepark {
  getBikeparkExternalID(): string;
  getCouncil(): Council;
  getExploitant(): Contact | null;
  getCalculatesCost(): boolean;
  getOccupationSource(): 'FMS' | string;
  getID(): string;
  getType(): 'fietsenstalling' | 'fietskluizen';
}

interface Council {
  getZipID(): string;
  getID(): string;
  getSiteID(): string;
}
```

---

## Stap 2: DeserializeJSON(transaction)

**Doel:** Haal het originele transactie-object uit de JSON op.

**Input:** Kolom `transaction` uit het wachtrij-record (JSON-string).

**Typische velden in de JSON:**
- `type` – "In", "Uit" of "Afboeking"
- `typeCheck` – "user", "controle", "section", "sync", "reservation", "beheer", "system"
- `transactionDate` – datum/tijdstip
- `barcodeBike` – optioneel barcode van de fiets
- `price` – optioneel bedrag
- `placeID` – optioneel bij kluizen
- `bikeTypeID`, `clientTypeID` – optioneel
- `paymenttypeid`, `amountpaid` – optioneel bij betaling

**Output:** `_transaction` struct met de velden uit de JSON.

**Opmerking:** `passID`, `passType`, `sectionID`, `typeCheck`, `transactionDate` komen uit het wachtrij-record zelf; bij enrich overschrijven ze eventuele waarden uit de JSON.

### TypeScript-definitie

```typescript
/** Struct uit JSON-kolom `transaction` (na DeserializeJSON) */
interface TransactionFromJson {
  type: TransactionType;
  typeCheck: TypeCheck;
  transactionDate: string;  // ISO 8601
  sectionID?: string;
  placeID?: number;
  externalPlaceID?: string;

  // Identificatie (minimaal één verplicht)
  passID?: string;
  idcode?: string;           // alias voor passID
  RFID?: string;
  barcodeBike?: string;
  bikeid?: string;           // alias voor barcodeBike

  // Passtype (optioneel, anders afgeleid)
  passType?: PassType;
  passtype?: PassType;
  idtype?: IdType;

  // Optioneel
  price?: number;
  bikeTypeID?: BikeTypeID;
  clientTypeID?: ClientTypeID;
  paymentTypeID?: number;
  amountpaid?: number;
  transactionID?: number;
  passInternalID?: string;   // intern, bij afboeking
}

type TransactionType = 'In' | 'Uit' | 'Out' | 'Afboeking';

type TypeCheck = 'user' | 'controle' | 'section' | 'sync' | 'reservation' | 'beheer' | 'system';

type PassType = 'sleutelhanger' | 'ovchip' | 'barcodebike';

/** idtype: 0=sleutelhanger, 1=ovchip, 2=cijfercode, 3=tmp_ovchip, 4=tmp_sleutelhanger, 10=biesieklette, 20=plek, 99=unknown */
type IdType = 0 | 1 | 2 | 3 | 4 | 10 | 20 | 99;

/** bikeTypeID: 1=normale fiets, 2=bromfiets, 3=speciale fiets, 4=elektrische fiets, 5=motorfiets */
type BikeTypeID = 1 | 2 | 3 | 4 | 5;

/** clientTypeID: 0=niet gegeven, 1=normaal, 2=abonnementhouder VS, 3=abonnementhouder anders */
type ClientTypeID = 0 | 1 | 2 | 3;

```

---

## Stap 3: Enrich

**Doel:** Vul het transactie-object aan met velden uit het wachtrij-record.

**Aanvulling:** `_transaction` krijgt de volgende velden uit het wachtrij-record:

| Veld | Bron | Opmerking |
|------|------|------------|
| `passID` | `q.passID` | Altijd |
| `passType` | `q.passType` | sleutelhanger, ovchip, barcodebike |
| `sectionID` | `q.sectionID` | Sectie |
| `typeCheck` | `q.typeCheck` | user, controle, section, sync, etc. |
| `transactionDate` | `q.transactionDate` | Transactiedatum |
| `transactionID` | `q.transactionID` | Alleen als ≠ 0 (bij afboekingen) |
| `externalPlaceID` | `q.externalPlaceID` | Alleen als aanwezig |

**Waarom:** De JSON bevat soms niet alle velden of verouderde waarden. De kolommen uit het wachtrij-record zijn de bron van waarheid.

### TypeScript-definitie

```typescript
/** Verrijkt transactie-object na stap 3 (Enrich). Combineert TransactionFromJson met velden uit WachtrijTransactieRecord. */
interface EnrichedTransaction extends TransactionFromJson {
  // Verplicht na enrich (uit wachtrij-record)
  passID: string;
  passType: PassType;
  sectionID: string;
  typeCheck: TypeCheck;
  transactionDate: string;  // ISO 8601

  // Optioneel toegevoegd uit wachtrij-record
  transactionID?: number;   // alleen als q.transactionID !== 0
  externalPlaceID?: string; // alleen als q.externalPlaceID aanwezig

  // Velden uit JSON blijven overige (type, price, barcodeBike, placeID, etc.)
}

/** Hoe enrich werkt: overschrijft/bepaalt velden uit record q */
function enrich(
  transaction: TransactionFromJson,
  record: WachtrijTransactieRecord
): EnrichedTransaction {
  const enriched: EnrichedTransaction = {
    ...transaction,
    passID: record.passID,
    passType: record.passType,
    sectionID: record.sectionID,
    typeCheck: record.typeCheck,
    transactionDate: record.transactionDate,
  };
  if (record.transactionID !== 0) enriched.transactionID = record.transactionID;
  if (record.externalPlaceID) enriched.externalPlaceID = record.externalPlaceID;
  return enriched;
}
```

---

## Stap 4: Fix

**Doel:** Corrigeer specifieke waarden voordat het record wordt verwerkt.

**Actie:** Als `typeCheck eq "section"` → `typeCheck = "user"`.

**Achtergrond bij typeCheck "section" → "user":**

- **Login** is een kluissysteem/software die transacties naar de wachtrij stuurt. Bij *sectiechecks* – checks op sectieniveau (niet op specifieke plek/kluis) – stuurt Login `typeCheck="section"`.
- **addTransactionToWachtrij** (TransactionGateway.cfc) accepteert `section` in de lijst `user,controle,section,sync,reservation,beheer,system`, dus de wachtrij kan `typeCheck="section"` bevatten.
- **putTransaction** en de tabel `transacties` gebruiken `type_checkin`/`type_checkout` met waarden zoals `user`, `controle`, `sync`, `system`, `reservation`, `beheer`. Daar wordt `section` niet als apart type gebruikt.
- Semantisch komen `section` en `user` overeen: beide zijn door de staller (gebruiker) geïnitieerde checks. Het verschil is alleen de granulariteit: Login gebruikt `section` voor checks op sectieniveau, VeiligStallen gebruikt `user` voor alle gebruikerschecks.
- De Fix stap zorgt voor deze normalisatie, zodat records uit Login correct in de transacties-tabel terechtkomen.

---

## Stap 5: uploadTransactionObject

**Doel:** Bereid de transactie voor en roep `putTransaction` aan.

**Input:** `_transaction` (struct), `bikepark` (object).

**Werking (in `BikeparkServiceImpl.uploadTransactionObject`):**

1. **Skippen:** Afboekingen met `price = 0` worden niet opgeslagen.
2. **Place:** Als `placeID` is gegeven → ophalen van `place` via `getPlace()`.
3. **Systeemafboeking:** Als `transactionID` is gegeven → ophalen van `bikepass` via `getBikepassByPassId()`, daarna direct `putTransaction` met `transactionID`.
4. **Stallingstransactie (In/Uit):**
   - Sectie ophalen via `getBikeparkSectionByExternalID(sectionID)`
   - Bepalen van `passType` en `passID` (uit struct of afgeleid van RFID/passID)
   - `bikepass` ophalen of aanmaken via `getBikepassByPassId()`
   - `barcodeBike` bijwerken: bij koppeling met andere pas wordt de barcode daar vandaan overgenomen
   - `clientTypeID` bepalen (default 0)
   - `putTransaction` aanroepen met `section`, `bikepass`, `typeCheck`, `transactionDate`, `type`, `clientTypeID`, etc.

**Output:** Geen returnwaarde; bij fout wordt een exception gegooid.

---

## Stap 6: putTransaction

**Doel:** INSERT of UPDATE van een record in de tabel `transacties`.

**Input:** `section`, `bikepass`, `type` (In/Uit/Afboeking), `type_check`, `date_transaction`, `clientTypeID`, optioneel `place`, `stallingskosten`, `externalPlaceID`, `transactionID`.

**Werking (in `TransactionGateway.putTransaction`):**

- **Afboeking:** `transactionID` is gegeven → bestaand record opzoeken en afboeking toepassen.
- **In:** Zoek passende record(s) in `transacties` (bijv. sync/system met `Date_checkout >= transactionDate`):  
  - Bestaand record → UPDATE (Type_checkin, Date_checkin, SectieID, etc.).  
  - Geen record → INSERT nieuw record.
- **Uit:** Zoek open record met `Date_checkout IS NULL`:  
  - Bestaand record → UPDATE (Type_checkout, Date_checkout, SectieUIT, etc.).  
  - Geen record → INSERT nieuw record met `Type_checkin = system` (geen eerdere checkin).

Daarnaast:
- Berekening van stallingskosten en tarieven
- Bijwerken van `accounts_pasIDs` (barcodeBike)
- Bijwerken van `accounts_pasIDs` (huidige sectie, stalling)

**Uitgebreide logica:** Zie `docs/analyse-motorblok/stroomdiagram-stallingstransacties_v2.md`.

---

## Stap 7: Resultaat

**Succes:**
```sql
UPDATE wachtrij_transacties
SET processed = 1, processDate = now()
WHERE ID = <recordID>
```

**Fout (exception):**
```sql
UPDATE wachtrij_transacties
SET error = <foutmelding>, processed = 2, processDate = now()
WHERE ID = <recordID>
```

Bij `price > 0` wordt de fout ook via `application.mailcontroller.toDb()` gelogd.

---

## Dataflow

```
wachtrij_transacties-record
    ↓
[1] getBikeparkByExternalID(bikeparkID) → bikepark
[2] DeserializeJSON(transaction) → _transaction
[3] Enrich: _transaction.passID = q.passID, etc.
[4] Fix: typeCheck "section" → "user"
[5] uploadTransactionObject(_transaction, bikepark)
        ↓
    getBikeparkSectionByExternalID, getBikepassByPassId
        ↓
[6] putTransaction(section, bikepass, ...) → INSERT/UPDATE transacties
    ↓
[7] UPDATE wachtrij_transacties SET processed=1 of 2
```

---

## Bestanden

| Stap | Bestand |
|------|---------|
| 1 | `BikeparkServiceImpl.getBikeparkByExternalID` of `Council.getBikeparkByExternalID` |
| 2–4 | `processTransactions2.cfm` (loop) |
| 5 | `BikeparkServiceImpl.uploadTransactionObject` |
| 6 | `TransactionGateway.putTransaction` |
| 7 | `processTransactions2.cfm` (UPDATE in cfcatch) |
