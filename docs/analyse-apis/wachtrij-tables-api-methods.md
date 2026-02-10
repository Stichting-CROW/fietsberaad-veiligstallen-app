# API-methodes die data in wachtrij_*-tabellen schrijven

Analyse van de ColdFusion-broncode: welke API-methodes schrijven data naar de tabellen `wachtrij_transacties`, `wachtrij_pasids`, `wachtrij_sync` en `wachtrij_betalingen`.

**Let op:** SOAP / CFC remote (v3-webservice) wordt niet meer gebruikt. Alleen de REST API is nog in gebruik voor externe aanroepen.

---

## 1. wachtrij_transacties

De INSERT wordt uitgevoerd in **TransactionGateway.addTransactionToWachtrij()**. Die wordt o.a. aangeroepen door:

| API / bron | Methode / endpoint |
|------------|--------------------|
| **REST** | `uploadTransaction`, `uploadTransactions` → o.a. `BaseRestService.uploadTransaction` (path `POST .../sections/{sectionid}/transactions`), `remote/REST/FMSService.cfc` |
| **Overige** | `www/views/fietskluizen/controller.cfm`, `cflib/.../Place.cfc`, `cflib/.../Transaction.cfc`, `cflib/.../connector/api/Prorail-events.cfc`, en intern in `TransactionGateway.cfc` |

---

## 2. wachtrij_pasids

De INSERT gebeurt in **BaseFMSService.addNewBikeToWachtrij()**, aangeroepen door `saveBike` en `saveBikes`:

| API | Methode |
|-----|--------|
| **REST** | `FMSService.saveBike`, `FMSService.saveBikes` (o.a. `remote/REST/FMSService.cfc`, `remote/REST/v3/fms_service.cfc`) |

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

---

## Samenvatting

| Tabel | API-methodes die data in de tabel schrijven |
|-------|--------------------------------------------|
| **wachtrij_transacties** | `uploadTransaction`, `uploadTransactions` (REST) |
| **wachtrij_pasids** | `saveBike`, `saveBikes` (REST) |
| **wachtrij_sync** | `syncSector` (REST) |
| **wachtrij_betalingen** | `addSaldo`, `addSaldos` (REST), en indirect via `uploadTransaction` wanneer de transactie betalingsvelden bevat |
