# API-methodes die data in wachtrij_*-tabellen schrijven

Analyse van de ColdFusion-broncode: welke API-methodes schrijven data naar de tabellen `wachtrij_transacties`, `wachtrij_pasids`, `wachtrij_sync` en `wachtrij_betalingen`.

**Let op:** SOAP / CFC remote (v3-webservice) wordt niet meer gebruikt. Alleen de REST API is nog in gebruik voor externe aanroepen.

---

## Samenvatting

| Tabel | API-methodes die data in de tabel schrijven |
|-------|--------------------------------------------|
| **wachtrij_transacties** | `uploadTransaction`, `uploadTransactions` (REST) |
| **wachtrij_pasids** | `saveBike`, `saveBikes` (REST) |
| **wachtrij_sync** | `syncSector` (REST) |
| **wachtrij_betalingen** | `addSaldo`, `addSaldos` (REST), en indirect via `uploadTransaction` wanneer de transactie betalingsvelden bevat |

---

## 1. wachtrij_transacties

De INSERT wordt uitgevoerd in **TransactionGateway.addTransactionToWachtrij()**. Die wordt o.a. aangeroepen door:

| API / bron | Methode / endpoint |
|------------|--------------------|
| **REST** | `uploadTransaction`, `uploadTransactions` → o.a. `BaseRestService.uploadTransaction` (path `POST .../sections/{sectionid}/transactions`), `remote/REST/FMSService.cfc` |
| **Overige** | `www/views/fietskluizen/controller.cfm`, `cflib/.../Place.cfc`, `cflib/.../Transaction.cfc`, `cflib/.../connector/api/Prorail-events.cfc`, en intern in `TransactionGateway.cfc` |



---

## 2. wachtrij_pasids

### Hoe de tabel data krijgt

**Aanroepers:** FMS-operators (fietsenstallingen) roepen de REST API aan om fiets-pas-koppelingen te registreren. Authenticatie via HTTP Basic; `operator`-permit vereist.

**Dataflow:**

1. **REST API** – Client stuurt een `saveBike` (één fiets) of `saveBikes` (bulk) request naar de ColdFusion REST-service.
2. **FMSService** – `remote/REST/FMSService.cfc` of `remote/REST/v3/fms_service.cfc` ontvangt het request.
3. **BaseFMSService.addNewBikeToWachtrij()** – Voert de INSERT uit in `wachtrij_pasids`.

**Request payload (Bike-object):**

| Veld | Beschrijving |
|------|--------------|
| `barcode` | Barcode van de fiets |
| `passID` | Barcode van de sleutelhanger/pas |
| `RFID` | (Optioneel) RFID van de pas |
| `RFIDBike` | (Optioneel) RFID van de fiets |
| `biketypeID` | (Optioneel) Fiets type ID |

Het volledige Bike-object wordt als JSON opgeslagen in het veld `bike` voor verwerking door de background processor.

**Tabelvelden die worden ingevuld bij INSERT:**

| Veld | Bron |
|------|------|
| `bikeparkID` | Uit de request-context (bikepark/locatie) |
| `passID`, `barcode`, `RFID`, `RFIDBike`, `biketypeID` | Uit het Bike-object |
| `bike` | Geserialiseerd JSON van het Bike-object |
| `transactionDate` | Tijdstip van de request |
| `processed` | `false` (0) |
| `DateCreated` | Tijdstip van INSERT |

**API-methodes die schrijven:**

| API | Methode |
|-----|--------|
| **REST** | `FMSService.saveBike`, `FMSService.saveBikes` (o.a. `remote/REST/FMSService.cfc`, `remote/REST/v3/fms_service.cfc`) |

### Processen die de data consumeren

**1. Background processor (ColdFusion)** – hoofdconsument

| Eigenschap | Waarde |
|------------|--------|
| **Bestand** | `/broncode/remote/remote/processTransactions2.cfm` |
| **Scheduled task** | "wachtrij transacties" in `scheduler.xml` |
| **Frequentie** | Elke 61 seconden |
| **Batchgrootte** | 50 records per run (instelbaar via `url.n`) |

**Verwerkingspijplijn per record:**

1. **Selectie** – Records met `processed = 0`, gesorteerd op `transactionDate`, LIMIT 50.
2. **Verwerking** – Voor elk record:
   - Bikepark ophalen via `application.service.getBikeparkByExternalID(bikeparkID)`
   - JSON-bike deserialiseren uit het veld `bike`
   - `application.service.saveBikeObject(bike, bikepark)` aanroepen, die:
     - `passID` aan bike barcode koppelt
     - Optioneel RFID aan passID of bike koppelt
     - Records in `accounts_pasids` aanmaakt of bijwerkt
     - Bike type-associaties afhandelt
3. **Succes** – `processed = 1`, `processDate` wordt gezet
4. **Fout** – `processed = 2`, foutmelding in `error`, e-mail naar `veiligstallen@gmail.com`

**Doeltabellen die bij verwerking worden bijgewerkt:** `accounts_pasids`, `accounts`

**2. Archiefproces (ColdFusion)**

| Eigenschap | Waarde |
|------------|--------|
| **Bestand** | `archiveWachtrijPasIDs.cfm` |
| **Actie** | Maakt dagelijks `wachtrij_pasids_archive{yyyymmdd}` aan en verplaatst records met `processed = 1` of `2` (succes of fout) |

**3. Next.js-app** – alleen lezen (monitoring)

De Veiligstallen-app consumeert de data niet voor verwerking, maar leest deze uitsluitend voor de wachtrij-monitor: API `GET /api/protected/wachtrij/wachtrij_pasids` en de UI `WachtrijMonitorComponent` (tab "PasIDs").

---

## 3. wachtrij_sync

De INSERT gebeurt in **BaseFMSService.syncSector()**:

| API | Methode |
|-----|--------|
| **REST** | `BaseRestService.syncSector` – o.a. path `/{citycode}/locations/{locationid}/sections/{sectionid}` (PUT) |

---

## 4. wachtrij_betalingen

De INSERT gebeurt in **BikeparkServiceImpl.addSaldoUpdateToWachtrij()**, aangeroepen door:

| API | Methode |
|-----|--------|
| **REST** | `FMSService.addSaldo`, `FMSService.addSaldos` (aanroep op `BaseFMSService`) |

**Let op:** Als een transactie via `uploadTransaction` / `addTransactionToWachtrij` **betaling** bevat (`paymenttypeid` + `amountpaid`), roept **TransactionGateway.addTransactionToWachtrij** intern `application.service.addSaldoUpdateToWachtrij()` aan — dezelfde upload schrijft dan ook naar **wachtrij_betalingen**.

