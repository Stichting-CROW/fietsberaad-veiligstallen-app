# FMS REST API v2/v3 – Overzicht tabellen en velden die gewijzigd worden door de "write" API calls

Dit document geeft een overzicht van alle databasetabellen en velden die kunnen worden gewijzigd door aanroepen naar de FMS REST API (v2 en v3). De analyse is gebaseerd op de ColdFusion-broncode in de `broncode` map.

**Wachtrijen en cache-tabellen:** De tabellen `wachtrij_transacties`, `wachtrij_pasids`, `wachtrij_betalingen` en `wachtrij_sync` fungeren als asynchrone buffer voor retry bij fouten; de queue-processor verwerkt deze naar de eindtabellen. De tabel `bezettingsdata_tmp` fungeert als cache voor bezettingsdata; een cronjob verwerkt deze naar `bezettingsdata`. De API-aanroepen die naar deze tussenliggende tabellen schrijven leiden dus direct tot wijzigingen in de eindtabellen (transacties, accounts, bezettingsdata, etc.).

---

## Scope

- **v2**: `remote/v2/FMSService.cfc` → `super.*` (BaseFMSService)
- **v3 FMS**: `remote/v3/FMSService.cfc` → `application.baseFMSService`
- **v3 REST**: `remote/REST/v3/fms_service.cfc` → `application.baseRestService` en `application.baseFMSService`

Alleen **schrijfbewerkingen** (INSERT, UPDATE) worden beschreven. Leesoperaties zijn buiten scope.

**API-logging buiten analyse:** De tabel `webservice_log` wordt bij elke API-aanroep gevuld via `doLog` (intern). Omdat dit een uniform side-effect is van alle operaties en geen domeinspecifieke datastroom vertegenwoordigt, is API-logging buiten de analyse gelaten in de secties Operation groups, Clusters en Target fields. De tabel staat wel vermeld in het overzicht per tabel (sectie 14).

---

## Clusters

### Clustermatrix (groep × tabel)

| Groep | transacties | transacties_archief | fietsenstalling_sectie | bezettingsdata | accounts_pasids | accounts | financialtransactions | abonnementen |
|-------|:-----------:|:-------------------:|:----------------------:|:-------------:|:---------------:|:--------:|:---------------------:|:-------------:|
| Stallingstransactie | * | * | * | | | | | |
| Bezettingsdata | | | * | * | | | | |
| Pasregistratie | | | | | * | | | |
| Saldo-opwaardering | | | | | | * | * | |
| Abonnement | | | | | | * | * | * |
| Abonnement + pas | | | | | * | * | | * |

* = primair doel van de groep

### Clusterbeschrijvingen

| Cluster | Groepen | Velden (tabel.veld) | Domein |
|---------|---------|---------------------|--------|
| **1. Transactie-core** | Stallingstransactie | transacties.*, transacties_archief.*, fietsenstalling_sectie.Bezetting | Check-in/out, archief, sectiebezetting |
| **2. Bezettingsdata** | Bezettingsdata | bezettingsdata.*, fietsenstalling_sectie.Bezetting | Externe bezettingsbronnen |
| **3. Pas/account** | Pasregistratie, Abonnement + pas | accounts_pasids.* | Sleutelhanger, barcode, huidige locatie |
| **4. Financieel** | Saldo-opwaardering, Abonnement | financialtransactions.*, accounts.{saldo, dateLastSaldoUpdate} | Betalingen, saldo |
| **5. Abonnement** | Abonnement, Abonnement + pas | abonnementen.* | Abonnementen |

Zie [Bijlage C: Clusters: groepen × velden](#bijlage-c-clusters-groepen--velden) voor de toelichting.

## Flow scenarios

### Transactie-core: flow-scenario's (happy en unhappy flows)

De volgende sectie beschrijft hoe de Transactie-core velden worden verwerkt per flow-scenario, gebaseerd op de ColdFusion-broncode (`TransactionGateway.putTransaction`, `syncSector`, `BikeparkServiceImpl.uploadTransactionObject`, `createStallingstransaction`).

#### Happy flows

##### 1. Check-in → wachten → check-out (matching pas ID en bicycle ID)

**Flow:** Gebruiker checkt in met pas en fietsbarcode, wacht, checkt uit met dezelfde combinatie.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | uploadTransaction type In | wachtrij_transacties | INSERT: transactionDate, bikeparkID, sectionID, placeID, passID, passType, price, type, typeCheck, transaction (JSON) | Via addTransactionToWachtrij |
| 2 | Queue-processor | transacties | INSERT: FietsenstallingID, SectieID, PlaceID, PasID, PasType, BarcodeFiets_in, Date_checkin, Type_checkin, Stallingskosten, BikeTypeID, ClientTypeID, ExploitantID, Tariefstaffels | putTransaction case "In", HAPPY FLOW nieuwe checkin (regel 273-377) |
| 2 | Queue-processor | accounts_pasids | UPDATE: huidigeFietsenstallingId, huidigeSectieId, dateLastCheck | Via bikepass.setBikeparkCurrentlyParked, saveBikepass |
| 2 | Queue-processor | fietsenstalling_sectie | UPDATE: Bezetting +1 | Alleen als occupationSource=FMS en typeCheck neq "sync" |
| 3 | uploadTransaction type Out | wachtrij_transacties | INSERT (idem) | |
| 4 | Queue-processor | transacties | UPDATE: Type_checkout, Date_checkout, SectieID_uit, BarcodeFiets_uit, Stallingskosten, Stallingsduur, dateModified | putTransaction case "Uit,Out" – vindt open transactie via OUT1a (barcode) of OUT1b (pasID) |
| 4 | Queue-processor | accounts_pasids | UPDATE: huidigeFietsenstallingId=NULL, huidigeSectieId=NULL | Bij check-out |
| 4 | Queue-processor | fietsenstalling_sectie | UPDATE: Bezetting -1 | |
| 4 | Queue-processor | financialtransactions | INSERT: amount (-stallingskosten), code="Stallingstransactie", transactionID | createStallingstransaction |
| 4 | Queue-processor | accounts | UPDATE: saldo, dateLastSaldoUpdate | Via recalculateAccountBalance |

**Stallingskosten (check-in):**

- **Intern:** De stallingskosten worden volgens het interne kostenmodel berekend op basis van de tariefstaffels van de sectie. Bij een nieuwe check-in is de stallingsduur nog 0, dus de kosten zijn 0.
- **Extern (stalling/FMS bepaalt):** Als het FMS een bedrag (`price`) meestuurt bij de transactie, wordt dat bedrag gebruikt in plaats van de interne berekening. De stalling bepaalt dan de kosten. *Configuratie:* wanneer de stalling is gemarkeerd als “bepaalt kosten zelf”, worden de centrale tariefstaffels nooit toegepast; als er geen bedrag wordt meegestuurd, blijven de kosten 0.

**Stallingskosten (check-out):**

- **Intern:** De stallingskosten worden volgens het interne kostenmodel berekend op basis van de stallingsduur (verschil tussen check-in en check-out) en de tariefstaffels per tijdsperiode (uren).
- **Extern (stalling/FMS bepaalt):** Als het FMS een bedrag (`price`) meestuurt, wordt dat gebruikt; anders wordt intern berekend.

##### 2. Sync → fiets gevonden die niet was ingecheckt

**Flow:** syncSector/occupationAndSync met `bikes`-array. Fiets staat fysiek in sectie maar heeft geen open transactie.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | syncSector | wachtrij_transacties | INSERT: type="In", typeCheck="Sync" | Per fiets in bikes-array via addTransactionToWachtrij |
| 2 | Queue-processor | transacties | INSERT: idem check-in, Type_checkin="Sync" | putTransaction case "In" – geen bestaande sync/system-record → nieuwe checkin |
| 2 | Queue-processor | accounts_pasids | UPDATE: huidigeFietsenstallingId, huidigeSectieId | syncSector: "passen in de stalling zetten die er wel in horen" |
| 2 | Queue-processor | fietsenstalling_sectie | — | Bezetting niet bijgewerkt (typeCheck neq "sync" check in addTransactionToWachtrij sluit sync uit) |

**Stallingskosten:** Bij sync-transacties worden geen stallingskosten berekend; het bedrag blijft 0.

##### 3. Sync → fiets gevonden die niet was uitgecheckt

**Flow:** syncSector met `bikes`-array. Fiets stond in systeem als ingecheckt maar staat niet meer in de sync-lijst (fysiek weg).

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | syncSector | accounts_pasids | UPDATE: huidigeFietsenstallingId=NULL, huidigeSectieId=NULL | "passen vrij maken die niet in deze stalling horen" (PasID NOT IN listIdCodes) |
| 2 | syncSector | transacties | UPDATE: Date_checkout = DATE_ADD(Date_checkin, INTERVAL 3 HOUR), Type_checkout="sync", SectieID_uit, dateModified | Directe UPDATE; geen putTransaction. Voor PasID NOT IN (listIdCodes) met ISNULL(Date_checkout) |

**Stallingskosten:** Bij sync-checkout worden geen stallingskosten berekend; er wordt geen financiële transactie aangemaakt.

---

#### Unhappy flows

##### 4. Check-out met verkeerde pasID / bicycle ID combinatie

**Flow:** Gebruiker checkt uit met een andere pas of een andere fietsbarcode dan bij check-in.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | putTransaction case "Uit,Out" | — | Geen match | OUT1a: zoekt op BarcodeFiets_in = barcode_bike. OUT1b: zoekt op PasID IN (passID, barcodeBike). OUT3: zoekt met PasID = BarcodeFiets_in (dummy-fiets). Geen record gevonden. |
| 2 | putTransaction | transacties | INSERT: Type_checkin="system", Date_checkin = transactionDate - 180 min, Type_checkout = gegeven typeCheck, BarcodeFiets_uit, Stallingsduur | "Check-out zonder check-in" (regel 652-696): systeem maakt synthetische transactie aan |
| 2 | Queue-processor | accounts_pasids | UPDATE: huidigeFietsenstallingId=NULL, huidigeSectieId=NULL | |
| 2 | Queue-processor | financialtransactions | — | Geen: systeem-check-in levert 0 stallingskosten op; geen afboeking |
| 2 | Queue-processor | accounts | — | Geen saldo-afboeking |

**Effect:** Er wordt een "ghost"-transactie aangemaakt met een systeem-check-in 180 minuten voor de check-out. Geen stallingskosten.

##### 5. Check-out zonder check-in door gebruiker

**Flow:** Gebruiker checkt uit zonder eerder ingecheckt te hebben (bijv. fiets direct uit stalling gehaald).

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | putTransaction case "Uit,Out" | — | Geen match | Zelfde zoeklogica als flow 4; geen open transactie |
| 2 | putTransaction | transacties | INSERT: Type_checkin="system", Date_checkin = transactionDate - 180 min, Type_checkout = gegeven typeCheck, BarcodeFiets_uit, Stallingsduur | Identiek aan flow 4 |
| 2 | Queue-processor | accounts_pasids | UPDATE: huidigeFietsenstallingId=NULL, huidigeSectieId=NULL | |
| 2 | Queue-processor | financialtransactions | — | Geen (stallingskosten = 0) |

**Effect:** Zelfde als flow 4; systeem vult een ontbrekende check-in aan met een synthetische check-in.

---

#### Overige gedocumenteerde flows

##### 6. Duplicate transactie

**Flow:** Zelfde check-in of check-out wordt nogmaals verwerkt.

| Actie | Tabel | Effect |
|-------|-------|--------|
| putTransaction | — | `<cfthrow message="Duplicate transactie">` (check-in: qDuplicateTransaction; check-out: qDuplicateTransaction) |

##### 7. Afboeking (tussentijdse kostenperiode)

**Flow:** Bij check-in met meerdere tariefstaffels wordt een afboeking voor de volgende kostenperiode in de wachtrij gezet.

| Stap | Actie | Tabel | Velden gewijzigd |
|------|-------|-------|------------------|
| 1 | putTransaction case "In" | wachtrij_transacties | INSERT: type="afboeking", typeCheck="system", transactionID, transactionDate = checkin + timespan eerste staffel |
| 2 | Queue-processor | transacties | UPDATE: Stallingskosten += extra_stallingskosten |
| 2 | Queue-processor | financialtransactions | INSERT (via createStallingstransaction) |
| 2 | Queue-processor | accounts | UPDATE saldo |

##### 8. Controle-scan (correctie binnen 30 min)

**Flow:** Controle-check-in binnen 30 min na controle-check-out op dezelfde pas – wordt behandeld als foutieve scan.

| Actie | Tabel | Effect |
|-------|-------|--------|
| putTransaction case "In" | transacties | UPDATE: Type_checkout=NULL, Date_checkout=NULL, BarcodeFiets_uit=NULL, Stallingsduur=NULL, Stallingskosten=0 |
| — | — | `<cfreturn>` – geen nieuwe check-in |

##### 9. Incheck op plek met andere pas

**Flow:** Bij incheck op een plek (fietskluizen) staan er al open transacties van andere passen voor die plek.

| Actie | Tabel | Effect |
|-------|-------|--------|
| putTransaction case "In" | wachtrij_transacties | INSERT: type="uit", typeCheck="system" voor elke open transactie met andere PasID op die plek |
| Queue-processor | transacties | UPDATE: afsluiten van die transacties met transactionDate = min(checkin + 180 min, transactionDate - 1s) |

##### 10. Incheck op gereserveerde plek

**Flow:** Gebruiker checkt in op een plek die hij eerder heeft gereserveerd.

| Actie | Tabel | Effect |
|-------|-------|--------|
| putTransaction case "In" | transacties | UPDATE bestaand record: Type_checkin = gegeven typeCheck, SectieID, BarcodeFiets_in, Reserveringsduur |
| — | fietsenstalling_plek | place.setBikeParked, savePlace |

---

#### Overzicht tabellen per flow

| Tabel | Flow 1 (happy) | Flow 2 (sync in) | Flow 3 (sync uit) | Flow 4/5 (wrong/no checkin) | Flow 6 (duplicate) |
|-------|----------------|------------------|------------------|----------------------------|----------|
| wachtrij_transacties | INSERT | INSERT | — | INSERT | — |
| transacties | INSERT, UPDATE | INSERT | UPDATE | INSERT | throw |
| transacties_archief | (via archive) | (via archive) | (via archive) | (via archive) | — |
| accounts_pasids | UPDATE | UPDATE | UPDATE | UPDATE | — |
| accounts | UPDATE | — | — | — | — |
| financialtransactions | INSERT | — | — | — | — |
| fietsenstalling_sectie | UPDATE Bezetting | — | — | UPDATE Bezetting | — |
| fietsenstalling_plek | UPDATE (bij place) | — | — | UPDATE (bij place) | — |

**Bron:** `TransactionGateway.cfc` (putTransaction, syncSector, getCost, addTransactionToWachtrij), `BikeparkServiceImpl.cfc` (uploadTransactionObject, createStallingstransaction), `processTransactions2.cfm`.

---

Het Bezettingsdata cluster omvat externe bezettingsbronnen (Lumiguide e.d.) en de FMS-path die bezetting uit transacties afleidt.

**API-methodes:** reportOccupationData, reportJsonOccupationData (→ bezettingsdata_tmp + fietsenstalling_sectie.Bezetting); update-bezettingsdata: Lumiguide-path (tmp → bezettingsdata) en FMS-path (transacties → bezettingsdata).

**Wanneer en hoe update-bezettingsdata wordt uitgevoerd:**
- **ColdFusion:** Cronjob dagelijks om 21:28 UTC (`scheduler.xml` → `updateTableBezettingsdata.cfm?timeintervals=15`). Ook handmatig via dashboard (Lumiguide-only, transacties-only, of beide).
- **Next.js:** Alleen handmatig via knop "Update bezettingsdata" in de parking simulation (Beheer → Parkeersimulatie → Motorblok). Endpoint: `POST /api/protected/parking-simulation/update-bezettingsdata` (fietsberaad_superadmin). Scope: testgemeente, laatste 7 dagen. Geen cron; de dagelijkse update-cache (rapportcaches) roept update-bezettingsdata niet aan.

| Tabel | Veld | Type | Wijziging via |
|-------|------|------|---------------|
| bezettingsdata | bikeparkID | direct | reportOccupationData: uit URL. FMS-path: uit fietsenstalling_sectie. |
| bezettingsdata | sectionID | direct | reportOccupationData: uit URL. FMS-path: uit fietsenstalling_sectie. |
| bezettingsdata | timestamp | direct / berekend | reportOccupationData: `timestamp` of now(), afgerond op interval. FMS-path: gegenereerde 15-min intervallen. |
| bezettingsdata | timestampStartInterval | direct / berekend | reportOccupationData: gelijk aan timestamp. FMS-path: gelijk aan timestamp. |
| bezettingsdata | interval | direct / berekend | reportOccupationData: `interval` (default 15). FMS-path: vast 15. |
| bezettingsdata | source | direct | reportOccupationData: `source` (default "Lumiguide"). FMS-path: "FMS". |
| bezettingsdata | occupation | direct / berekend | reportOccupationData: `occupation` uit payload. FMS-path: berekend uit checkins/checkouts (running total). |
| bezettingsdata | capacity | direct | reportOccupationData: `capacity` uit payload. |
| bezettingsdata | brutoCapacity | direct | reportOccupationData: `brutoCapacity` (optioneel). FMS-path: niet gezet. |
| bezettingsdata | checkins | direct / berekend | reportOccupationData: `checkins` uit payload. FMS-path: COUNT uit transacties per interval. |
| bezettingsdata | checkouts | direct / berekend | reportOccupationData: `checkouts` uit payload. FMS-path: COUNT uit transacties per interval. |
| bezettingsdata | open | direct | reportOccupationData: `open` uit payload. |
| bezettingsdata | rawData | direct | reportOccupationData: `rawData` uit payload (max 255/65535). |
| bezettingsdata | dateCreated | berekend / direct | Upsert: now() bij create. |
| bezettingsdata | dateModified | berekend | Upsert: default now(). |
| fietsenstalling_sectie | Bezetting | direct | reportOccupationData: `occupation` uit payload. (FMS-path: zie Transactie-core.) |

**Type:** *direct* = 1-op-1 kopie; *afgeleid* = uit lookup/join; *berekend* = formule, now(), COUNT; *other* = overig.

---

### Bezettingsdata: flow-scenario's

De volgende sectie beschrijft hoe het Bezettingsdata-cluster velden worden verwerkt per flow-scenario, gebaseerd op de ColdFusion-broncode.

#### Happy flows

##### 1. reportOccupationData (externe bron, bijv. Lumiguide)

**Flow:** Externe bron (Lumiguide, sensoren) stuurt bezettingsdata door via reportOccupationData of occupationAndSync.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | reportOccupationData | bezettingsdata_tmp | INSERT/UPDATE: timestampStartInterval, timestamp, source, bikeparkID, sectionID, checkins, checkouts, occupation, capacity, brutoCapacity, rawData, open | OccupationDao.save; ON DUPLICATE KEY UPDATE |
| 2 | reportOccupationData | fietsenstalling_sectie | UPDATE: Bezetting | Alleen als occupationSource van bikepark overeenkomt met GetAuthUser() |

##### 2. update-bezettingsdata (cronjob: Lumiguide-path)

**Flow:** Cronjob lumiguide.cfm verwerkt bezettingsdata_tmp naar bezettingsdata.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | lumiguide.cfm | bezettingsdata | INSERT: data uit bezettingsdata_tmp, geaggregeerd op 15-min intervallen | |
| 2 | lumiguide.cfm | bezettingsdata_tmp | UPDATE source='archived', daarna TRUNCATE | |

##### 3. update-bezettingsdata (FMS-path)

**Flow:** Cronjob updateTableBezettingsdata.cfm met FMS-path: transacties → bezettingsdata.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | updateTableBezettingsdata.cfm | bezettingsdata | INSERT/UPDATE: checkins, checkouts, occupation (running total) per 15-min interval | Berekend uit transacties per sectie |

#### Overzicht tabellen per flow

| Tabel | Flow 1 (report) | Flow 2 (Lumiguide cron) | Flow 3 (FMS-path) |
|-------|-----------------|-------------------------|-------------------|
| bezettingsdata_tmp | INSERT/UPDATE | — | — |
| bezettingsdata | — | INSERT | INSERT/UPDATE |
| fietsenstalling_sectie | UPDATE Bezetting | — | — |

**Bron:** `BaseFMSService.reportOccupationData`, `OccupationDao.save`, `lumiguide.cfm`, `updateTableBezettingsdata.cfm`.

---

### Pas/account (detail)

Het Pas/account cluster omvat sleutelhangerregistratie en koppeling van pas aan abonnement.

**API-methodes:** saveBike, saveBikes, saveJsonBike, saveJsonBikes (→ wachtrij_pasids → queue-processor → accounts_pasids); subscribe (→ abonnementen.bikepassID, accounts_pasids.dateLastSubscriptionUpdate). *Nota:* huidigeFietsenstallingId, huidigeSectieId worden ook gezet door uploadTransaction (putTransaction) bij check-in/out.

| Tabel | Veld | Type | Wijziging via |
|-------|------|------|---------------|
| accounts_pasids | PasID | direct | saveBike*: `passID` uit body. |
| accounts_pasids | Pastype | direct / afgeleid | saveBike*: afgeleid uit `idtype` (1=ovchip, 2=barcodebike) of default "sleutelhanger". |
| accounts_pasids | barcodeFiets | direct | saveBike*: `barcode` uit body. Of bij check-in: barcodeFiets uit putTransaction. |
| accounts_pasids | AccountID | afgeleid | saveBike*: via getBikepassByPassId — lookup of nieuw account aanmaken. |
| accounts_pasids | Naam | other | Optioneel in ColdFusion saveBike; niet in huidige Next.js API. |
| accounts_pasids | huidigeFietsenstallingId | afgeleid | uploadTransaction (putTransaction): bij check-in = stallingID; bij check-out = null. |
| accounts_pasids | huidigeSectieId | afgeleid | uploadTransaction (putTransaction): bij check-in = sectionID; bij check-out = null. |

**Type:** *direct* = 1-op-1 kopie; *afgeleid* = uit lookup/join; *berekend* = formule, now(); *other* = overig.

*saveBike* = saveBike, saveBikes, saveJsonBike, saveJsonBikes (via wachtrij + queue-processor).

---

### Pas/account: flow-scenario's

De volgende sectie beschrijft hoe het Pas/account-cluster velden worden verwerkt per flow-scenario, gebaseerd op de ColdFusion-broncode.

#### Happy flows

##### 1. saveBike – nieuwe fiets koppelen aan sleutelhanger

**Flow:** Gebruiker koppelt fietsbarcode aan sleutelhanger (passID) via saveBike/saveBikes.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | saveBike | wachtrij_pasids | INSERT: transactionDate, bikeparkID, passID, barcode, RFID, bike (JSON) | Via addNewBikeToWachtrij |
| 2 | Queue-processor | accounts_pasids | INSERT of UPDATE: PasID, Pastype, barcodeFiets, BikeTypeID, dateLastIdUpdate, AccountID | saveBikeObject: getBikepassByPassId (createNew=true) of bestaande; setBarcodeBike, saveBikepass |
| 2 | Queue-processor | accounts | INSERT | Indien nieuwe bikepass: nieuw account via getNewSystemAccount |

##### 2. saveBike – RFID koppelen aan sleutelhanger (Helmond-situatie)

**Flow:** RFID en sleutelhanger beide meegegeven; RFID wordt aan bestaande sleutelhanger gekoppeld.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 2 | saveBikeObject | accounts_pasids | UPDATE: RFID, dateLastIdUpdate | Andere bikepass metzelfde RFID wordt ontkoppeld (setRFID "") |

##### 3. uploadTransaction (check-in/out) – huidige locatie

**Flow:** Zie Transactie-core flow 1; putTransaction werkt accounts_pasids bij.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| — | putTransaction | accounts_pasids | UPDATE: huidigeFietsenstallingId, huidigeSectieId, dateLastCheck | Check-in: stalling/sectie gezet; check-out: null |

##### 4. syncSector – passen in/vrij stalling

**Flow:** Zie Transactie-core flow 2 en 3.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| — | syncSector | accounts_pasids | UPDATE: huidigeFietsenstallingId, huidigeSectieId | Passen IN bikes-array: locatie gezet; passen NIET IN: null |

#### Unhappy flows

##### 5. saveBike – barcode al gekoppeld aan andere pas

**Flow:** Fietsbarcode staat al op een andere bikepass.

| Actie | Tabel | Effect |
|-------|-------|--------|
| saveBikeObject | accounts_pasids | Oude bikepass: barcodeFiets wordt ontkoppeld (stealBarcodeFromBikepass). Nieuwe bikepass krijgt barcode. |

#### Overzicht tabellen per flow

| Tabel | Flow 1 (saveBike) | Flow 2 (RFID) | Flow 3 (uploadTransaction) | Flow 4 (sync) |
|-------|-------------------|---------------|----------------------------|---------------|
| wachtrij_pasids | INSERT | — | — | — |
| accounts_pasids | INSERT/UPDATE | UPDATE | UPDATE | UPDATE |
| accounts | INSERT (indien nieuw) | — | — | — |

**Bron:** `BaseFMSService.saveBike`, `BikeparkServiceImpl.saveBikeObject`, `TransactionGateway.putTransaction`, `TransactionGateway.syncSector`, `processTransactions2.cfm`.

---

### Financieel (detail)

Het Financieel cluster omvat saldo-opwaardering en betalingen (incl. stallingskosten bij check-out).

**API-methodes:** addSaldo, addSaldos, addJsonSaldo, addJsonSaldos (→ wachtrij_betalingen → queue-processor); uploadTransaction met `amountpaid` (→ wachtrij_betalingen); uploadTransaction bij check-out (→ saldo afboeking + financialtransactions via putTransaction); addSubscription, addSubscriptionPlace (→ financialtransactions bij amount > 0).

| Tabel | Veld | Type | Wijziging via |
|-------|------|------|---------------|
| accounts | saldo | berekend | addSaldo*: saldo + amount. uploadTransaction check-out: saldo - stallingskosten. |
| accounts | dateLastSaldoUpdate | berekend | addSaldo*: now(). uploadTransaction check-out: now(). |
| financialtransactions | accountID | afgeleid | addSaldo*: via passID → getBikepassByPassId → AccountID. uploadTransaction: uit bikepass. addSubscription: uit passID of accountID. |
| financialtransactions | amount | direct | addSaldo*: `amount` uit body. uploadTransaction check-out: stallingskosten. addSubscription: `amount` uit body. |
| financialtransactions | transactionDate | direct | addSaldo*: `transactionDate` uit body. uploadTransaction: transactionDate. addSubscription: ingangsdatum. |
| financialtransactions | bikeparkID | direct | addSaldo*: uit URL. uploadTransaction: uit stalling. addSubscription: uit bikepark. |
| financialtransactions | code | afgeleid | addSaldo*: `saldo_${paymentTypeID}`. uploadTransaction: "stallingskosten". addSubscription: `subscription_${subscriptiontypeID}`. |
| financialtransactions | status | direct | addSaldo*: "completed". uploadTransaction: "completed". addSubscription: "completed". |
| financialtransactions | paymentMethod | afgeleid | addSaldo*: paymentTypeID 1 = "betaald", anders "kwijtschelding". addSubscription: idem. uploadTransaction: "stallingskosten". |
| financialtransactions | siteID | afgeleid | addSaldo*: bikepark.SiteID. addSubscription: bikepark.SiteID. |
| financialtransactions | subscriptionID | direct | addSubscription: ID van nieuw abonnement. |
| financialtransactions | subscriptiontypeID | direct | addSubscription: `subscriptiontypeID` uit body. |
| financialtransactions | transactionID | afgeleid | uploadTransaction check-out: ID van transactie. |
| financialtransactions | paidToSiteID | other | Niet gezet door addSaldo/addSubscription in Next.js; mogelijk ColdFusion. |
| financialtransactions | sourceSiteID | other | Niet gezet door addSaldo/addSubscription in Next.js; mogelijk ColdFusion. |
| financialtransactions | targetSiteID | other | Niet gezet door addSaldo/addSubscription in Next.js; mogelijk ColdFusion. |

**Type:** *direct* = 1-op-1 kopie; *afgeleid* = uit lookup/join; *berekend* = formule, now(); *other* = overig.

*addSaldo* = addSaldo, addSaldos, addJsonSaldo, addJsonSaldos (via wachtrij + queue-processor).

---

### Financieel: flow-scenario's

De volgende sectie beschrijft hoe het Financieel-cluster velden worden verwerkt per flow-scenario, gebaseerd op de ColdFusion-broncode.

#### Happy flows

##### 1. addSaldo – saldo opwaardering in stalling

**Flow:** Gebruiker waardeert saldo op via automaat of balie; addSaldo/addSaldos wordt aangeroepen.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | addSaldo | wachtrij_betalingen | INSERT: transactionDate, bikeparkID, passID, paymentTypeID, amount, processed | Via addSaldoUpdateToWachtrij |
| 2 | Queue-processor | financialtransactions | INSERT: accountID, amount, transactionDate, code ("betaling in stalling" of "restitutie"), bikeparkID | addSaldoObject |
| 2 | Queue-processor | accounts | UPDATE: saldo (via recalculateAccountBalance), dateLastSaldoUpdate | |

##### 2. addSaldo – kwijtschelding door beheerder

**Flow:** Beheerder scheldt schuld kwijt (paymentTypeID=2).

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 2 | addSaldoObject | financialtransactions | INSERT: code="afwaardering in stalling", amount (negatief) | |
| 2 | addSaldoObject | accounts | UPDATE: saldo | |

##### 3. uploadTransaction check-out – stallingskosten afboeking

**Flow:** Zie Transactie-core flow 1; createStallingstransaction bij check-out.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| — | createStallingstransaction | financialtransactions | INSERT: amount (-stallingskosten), code="Stallingstransactie", transactionID | |
| — | createStallingstransaction | accounts | UPDATE: saldo, dateLastSaldoUpdate | Via recalculateAccountBalance |

##### 4. uploadTransaction met amountpaid – betaling bij transactie

**Flow:** FMS stuurt transactie mee met amountpaid; betaling wordt in wachtrij gezet.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | addTransactionToWachtrij | wachtrij_betalingen | INSERT (via addSaldoUpdateToWachtrij) | Indien paymenttypeid en amountpaid aanwezig |
| 2 | Queue-processor | financialtransactions, accounts | Idem addSaldo | |

#### Unhappy flows

##### 5. addSaldo – passID niet gevonden

**Flow:** passID komt niet voor in accounts_pasids.

| Actie | Tabel | Effect |
|-------|-------|--------|
| addSaldoObject | accounts_pasids, accounts | Nieuw systeemaccount en bikepass worden aangemaakt; saldo wordt op dat account geboekt |

#### Overzicht tabellen per flow

| Tabel | Flow 1 (opwaardering) | Flow 2 (kwijtschelding) | Flow 3 (check-out) | Flow 4 (amountpaid) |
|-------|------------------------|--------------------------|-------------------|---------------------|
| wachtrij_betalingen | INSERT | INSERT | — | INSERT |
| financialtransactions | INSERT | INSERT | INSERT | INSERT |
| accounts | UPDATE | UPDATE | UPDATE | UPDATE |

**Bron:** `BikeparkServiceImpl.addSaldoObject`, `addSaldoUpdateToWachtrij`, `BikeparkServiceImpl.createStallingstransaction`, `TransactionGateway.addTransactionToWachtrij`, `processTransactions2.cfm`.

---

### Abonnement (detail)

Het Abonnement cluster omvat aanmaak en koppeling van abonnementen.

**API-methodes:** addSubscription, addSubscriptionPlace (→ abonnementen, financialtransactions); subscribe (→ abonnementen.bikepassID, accounts_pasids.dateLastSubscriptionUpdate).

| Tabel | Veld | Type | Wijziging via |
|-------|------|------|---------------|
| abonnementen | subscriptiontypeID | direct | addSubscription*: `subscriptiontypeID` uit body. |
| abonnementen | AccountID | afgeleid | addSubscription*: via passID → getBikepassByPassId → AccountID, of `accountID` uit body. |
| abonnementen | bikepassID | afgeleid / direct | addSubscription*: via passID → getBikepassByPassId → ID. subscribe: passID → accounts_pasids lookup → ID. |
| abonnementen | bikeparkID | afgeleid | addSubscription*: bikepark.StallingsID uit URL. |
| abonnementen | exploitantID | afgeleid | addSubscription*: bikepark.ExploitantID. |
| abonnementen | ingangsdatum | direct | addSubscription*: `ingangsdatum` of `transactionDate` uit body. |
| abonnementen | afloopdatum | direct | addSubscription*: `afloopdatum` uit body. |
| abonnementen | prijsInclBtw | direct | addSubscription*: `amount` uit body (default 0). |
| abonnementen | isActief | direct | addSubscription*: true bij aanmaak. |
| abonnementen | koppelingsdatum | berekend | addSubscription*: now() wanneer bikepassID gezet. subscribe: now(). |

**Type:** *direct* = 1-op-1 kopie; *afgeleid* = uit lookup/join; *berekend* = formule, now(); *other* = overig.

*addSubscription* = addSubscription, addSubscriptionPlace.

---

### Abonnement: flow-scenario's

De volgende sectie beschrijft hoe het Abonnement-cluster velden worden verwerkt per flow-scenario, gebaseerd op de ColdFusion-broncode.

#### Happy flows

##### 1. addSubscription – nieuw abonnement aanmaken

**Flow:** Beheerder of systeem maakt abonnement aan voor een pas/account bij een stalling.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | addSubscription | abonnementen | INSERT: subscriptiontypeID, AccountID, bikepassID, bikeparkID, exploitantID, ingangsdatum, afloopdatum, prijsInclBtw, isActief, koppelingsdatum | Via passID → getBikepassByPassId; accountID uit body of bikepass |
| 1 | addSubscription | financialtransactions | INSERT: amount, code ("abonnement"), subscriptionID, subscriptiontypeID, bikeparkID, transactionDate | Indien amount > 0 |

##### 2. addSubscriptionPlace – abonnement koppelen aan plek

**Flow:** Abonnement wordt gekoppeld aan een specifieke plek (fietskluis).

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | addSubscriptionPlace | abonnementen | UPDATE: plekID (of plek-koppeling) | Koppeling abonnement ↔ plek |
| 1 | addSubscriptionPlace | financialtransactions | INSERT (indien betaling) | Idem addSubscription |

##### 3. subscribe – pas koppelen aan bestaand abonnement

**Flow:** Gebruiker koppelt sleutelhanger (passID) aan bestaand abonnement via subscribe.

| Stap | Actie | Tabel | Velden gewijzigd | Opmerking |
|------|-------|-------|------------------|-----------|
| 1 | subscribe | abonnementen | UPDATE: bikepassID, koppelingsdatum | passID → accounts_pasids lookup → bikepassID |
| 1 | subscribe | accounts_pasids | UPDATE: dateLastSubscriptionUpdate | |

#### Unhappy flows

##### 4. addSubscription – passID niet gevonden

**Flow:** passID komt niet voor in accounts_pasids.

| Actie | Tabel | Effect |
|-------|-------|--------|
| addSubscription | accounts_pasids, accounts | Nieuw systeemaccount en bikepass worden aangemaakt (getBikepassByPassId createNew=true); abonnement gekoppeld aan nieuw account |

##### 5. subscribe – abonnement niet gevonden of al gekoppeld

**Flow:** Geen geldig abonnement voor stalling/account, of abonnement heeft al bikepassID.

| Actie | Tabel | Effect |
|-------|-------|--------|
| subscribe | — | Geen wijziging; foutmelding of skip |

#### Overzicht tabellen per flow

| Tabel | Flow 1 (addSubscription) | Flow 2 (addSubscriptionPlace) | Flow 3 (subscribe) |
|-------|--------------------------|------------------------------|-------------------|
| abonnementen | INSERT | UPDATE | UPDATE |
| financialtransactions | INSERT (indien amount) | INSERT (indien amount) | — |
| accounts_pasids | — | — | UPDATE |
| accounts | INSERT (indien nieuw) | — | — |

**Bron:** `BaseFMSService.addSubscription`, `BikeparkServiceImpl.saveSubscription`, `BaseFMSService.subscribe`, `BikeparkServiceImpl.subscribe`.

---

## Target fields (statische / eindtabellen)

Overzicht van alle `tabel.veld`-combinaties die door de API worden gewijzigd in **statische en eindtabellen**. Wachtrij-tabellen (`wachtrij_*`) en de cache-tabel `bezettingsdata_tmp` zijn weggelaten; die fungeren als tussenbuffer. Plek-gerelateerde velden (o.a. plekID, fietsenstalling_plek) staan in [Bijlage B: Fietskluizen](#bijlage-b-fietskluizen).

De kolommen 1–5 corresponderen met de clusters in de clustermatrix hierboven. Zie [Bijlage C: Clusters: groepen × velden](#bijlage-c-clusters-groepen--velden) voor de toelichting. * = veld wordt gewijzigd door operaties in dat cluster.

| Tabel | Veld | 1. Transactie-core | 2. Bezettingsdata | 3. Pas/account | 4. Financieel | 5. Abonnement |
|-------|------|:------------------:|:-----------------:|:--------------:|:-------------:|:-------------:|
| abonnementen | afloopdatum | | | | | * |
| abonnementen | bikepassID | | | | | * |
| abonnementen | exploitantID | | | | | * |
| abonnementen | ingangsdatum | | | | | * |
| abonnementen | isActief | | | | | * |
| abonnementen | prijsInclBtw | | | | | * |
| abonnementen | subscriptiontypeID | | | | | * |
| accounts | dateLastSaldoUpdate | | | | * | |
| accounts | saldo | | | | * | |
| accounts_pasids | AccountID | | | * | | |
| accounts_pasids | Naam | | | * | | |
| accounts_pasids | PasID | | | * | | |
| accounts_pasids | Pastype | | | * | | |
| accounts_pasids | barcodeFiets | | | * | | |
| accounts_pasids | huidigeFietsenstallingId | | | * | | |
| accounts_pasids | huidigeSectieId | | | * | | |
| bezettingsdata | bikeparkID | | * | | | |
| bezettingsdata | brutoCapacity | | * | | | |
| bezettingsdata | capacity | | * | | | |
| bezettingsdata | checkins | | * | | | |
| bezettingsdata | checkouts | | * | | | |
| bezettingsdata | dateCreated | | * | | | |
| bezettingsdata | dateModified | | * | | | |
| bezettingsdata | interval | | * | | | |
| bezettingsdata | occupation | | * | | | |
| bezettingsdata | open | | * | | | |
| bezettingsdata | rawData | | * | | | |
| bezettingsdata | sectionID | | * | | | |
| bezettingsdata | source | | * | | | |
| bezettingsdata | timestamp | | * | | | |
| bezettingsdata | timestampStartInterval | | * | | | |
| fietsenstalling_sectie | Bezetting | * | * | | | |
| financialtransactions | accountID | | | | * | |
| financialtransactions | amount | | | | * | |
| financialtransactions | bikeparkID | | | | * | |
| financialtransactions | code | | | | * | |
| financialtransactions | paidToSiteID | | | | * | |
| financialtransactions | sourceSiteID | | | | * | |
| financialtransactions | status | | | | * | |
| financialtransactions | subscriptionID | | | | * | |
| financialtransactions | subscriptiontypeID | | | | * | |
| financialtransactions | targetSiteID | | | | * | |
| financialtransactions | transactionDate | | | | * | |
| transacties | BikeTypeID | * | | | | |
| transacties | ClientTypeID | * | | | | |
| transacties | Date_checkin | * | | | | |
| transacties | Date_checkout | * | | | | |
| transacties | FietsenstallingID | * | | | | |
| transacties | PasID | * | | | | |
| transacties | PlaceID | * | | | | |
| transacties | SectieID | * | | | | |
| transacties | Stallingskosten | * | | | | |
| transacties_archief | biketypeid | * | | | | |
| transacties_archief | checkindate | * | | | | |
| transacties_archief | checkoutdate | * | | | | |
| transacties_archief | clienttypeid | * | | | | |
| transacties_archief | citycode | * | | | | |
| transacties_archief | created | * | | | | |
| transacties_archief | daybeginsat | * | | | | |
| transacties_archief | externalplaceid | * | | | | |
| transacties_archief | exploitantid | * | | | | |
| transacties_archief | locationid | * | | | | |
| transacties_archief | modified | * | | | | |
| transacties_archief | placeid | * | | | | |
| transacties_archief | price | * | | | | |
| transacties_archief | reservationtime | * | | | | |
| transacties_archief | sectionid | * | | | | |
| transacties_archief | sectionid_out | * | | | | |
| transacties_archief | source | * | | | | |

---

## Bijlage C: Clusters: groepen × velden

Clusters zijn blokken in de matrix **groepen (x) × velden (y)**. Groepen die dezelfde velden raken vormen een cluster; velden die door dezelfde groepen worden gewijzigd vormen de andere as. Er zijn **5 clusters** voor de algemene fietsenstallingen (niet-kluis).

### Overlap en afbakening

Zie Scope voor de reden waarom API-logging (webservice_log) buiten de analyse valt.
---

## Bijlage A: Details

---

## Overzicht per tabel

### 1. wachtrij_transacties

**Doel:** Asynchrone buffer voor stallingstransacties (in/uitcheck). De queue-processor verwerkt deze naar `transacties` en `transacties_archief`.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| uploadTransaction | ✅ | ✅ | ✅ |
| uploadTransactions | ✅ | ✅ | ❌ |
| uploadJsonTransaction | ✅ | ❌ | ❌ |
| uploadJsonTransactions | ✅ | ❌ | ❌ |
| uploadTransactionPlace | ❌ | ❌ | ✅ |
| uploadCompletedTransactionBikepark | ❌ | ❌ | ✅ |
| uploadCompletedTransactionSection | ❌ | ❌ | ✅ |
| updateLocker (statuscode 0 of 1) | ✅ | ✅ | ❌ |

**Velden (INSERT):** `transactionDate`, `bikeparkID`, `sectionID`, `placeID`, `externalPlaceID`, `transactionID`, `passID`, `passType`, `price`, `type`, `typeCheck`, `transaction` (JSON), `processed`

**Bron:** `TransactionGateway.addTransactionToWachtrij()`, `BaseFMSService.updateLocker()`

---

### 2. wachtrij_pasids

**Doel:** Asynchrone buffer voor pasregistraties (koppeling barcode fiets aan sleutelhanger). De queue-processor verwerkt deze naar `accounts_pasids`.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| saveBike | ✅ | ✅ | ❌ |
| saveBikes | ✅ | ✅ | ❌ |
| saveJsonBike | ✅ | ❌ | ❌ |
| saveJsonBikes | ✅ | ❌ | ❌ |

**Velden (INSERT):** `transactionDate`, `bikeparkID`, `passID`, `barcode`, `RFID`, `RFIDBike`, `biketypeID`, `bike` (JSON), `processed`

**Bron:** `BaseFMSService.addNewBikeToWachtrij()`

---

### 3. wachtrij_betalingen

**Doel:** Asynchrone buffer voor saldo-opwaarderingen. De queue-processor verwerkt deze naar `financialtransactions` en `accounts`.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| addSaldo | ✅ | ✅ | ❌ |
| addSaldos | ✅ | ✅ | ❌ |
| addJsonSaldo | ✅ | ❌ | ❌ |
| addJsonSaldos | ✅ | ❌ | ❌ |
| uploadTransaction (met amountpaid) | ✅ | ✅ | ✅ |

**Velden (INSERT):** `transactionDate`, `bikeparkID`, `passID`, `paymentTypeID`, `amount`, `processed`

**Bron:** `BikeparkServiceImpl.addSaldoUpdateToWachtrij()`, `TransactionGateway.addTransactionToWachtrij()` (bij betaling in transactie)

---

### 4. wachtrij_sync *(fietskluizen)*

**Doel:** Asynchrone buffer voor sectiesynchronisatie (welke fietsen staan waar). De queue-processor verwerkt deze naar `transacties`, `accounts_pasids` en `fietsenstalling_plek`. Alleen van toepassing op fietskluizen; zie [Bijlage A](#bijlage-a-fietskluizen).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| syncSector | ✅ | ✅ | ❌ |
| occupationAndSync (met bikes) | ❌ | ❌ | ✅ |

**Velden (INSERT):** `bikes` (JSON), `bikeparkID`, `sectionID`, `transactionDate`

**Bron:** `BaseFMSService.syncSector()`, `BaseRestService.syncSector()`

---

### 5. bezettingsdata_tmp

**Doel:** Cache-tabel voor bezettingsdata (Lumiguide/externe bronnen), vergelijkbaar met de wachtrij-tabellen. Wordt door een cronjob verwerkt naar `bezettingsdata`. Buiten de analyse (zie Target fields).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| reportOccupationData | ✅ | ✅ | ❌ |
| occupationAndSync (met occupation) | ❌ | ❌ | ✅ |
| setOccupation (v3 REST intern) | ❌ | ❌ | ✅ |

**Velden (INSERT/UPDATE):** `timestampStartInterval`, `timestamp`, `interval`, `source`, `bikeparkID`, `sectionID`, `brutoCapacity`, `capacity`, `occupation`, `checkins`, `checkouts`, `open`, `rawData`, `dateModified`

**Bron:** `OccupationDao.save()`, `BaseRestService.setOccupation()`

---

### 6. fietsenstalling_sectie

**Doel:** Sectie-eigenschappen, o.a. bezetting.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| reportOccupationData | ✅ | ✅ | ❌ |
| uploadTransaction (type In/Out, occupationSource=FMS) | ✅ | ✅ | ✅ |

**Velden (UPDATE):**
- `bezetting` – bij reportOccupationData (als occupationSource) en bij uploadTransaction (In: +1, Uit: -1)

**Bron:** `application.service.saveBikeparkSection()`, `TransactionGateway.addTransactionToWachtrij()` (directe UPDATE)

---

### 7. fietsenstalling_plek *(fietskluizen)*

**Doel:** Kluizen/plaatsen (status, urlwebservice, naam, etc.). Alleen van toepassing op fietskluizen; zie [Bijlage A](#bijlage-a-fietskluizen).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| updateLocker | ✅ | ✅ | ❌ |
| setUrlWebserviceForLocker | ✅ | ✅ | ❌ |
| updatePlace | ❌ | ❌ | ✅ |
| koppelpas_location / koppelpas_section / koppelpas_place | ❌ | ❌ | ✅ |

**Velden (UPDATE):**
- `urlwebservice` – setUrlWebserviceForLocker, updatePlace
- `titel` (name) – updatePlace
- `Status` – updatePlace (statuscode)
- `dateLastStatusUpdate` – updatePlace (statuscode)
- `bikeParked` – updateLocker, koppelpas (via savePlace)
- `isActief` – updateLocker (statuscode 2, 3, 4)
- `isGeblokeerd` – updateLocker (statuscode 2, 3)
- `username`, `password` – updatePlace

**Bron:** `application.service.savePlace()`, `BaseFMSService.setUrlWebserviceForLocker()`, `BaseFMSService.updateLocker()`, `BaseRestService.koppelpas()`

---

### 8. abonnementen

**Doel:** Abonnementen gekoppeld aan sleutelhangers en plaatsen.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| addSubscription | ✅ | ✅ | ✅ |
| addSubscriptionPlace | ❌ | ❌ | ✅ |
| subscribe | ✅ | ✅ | ❌ |
| koppelpas_* | ❌ | ❌ | ✅ |

**Velden (INSERT/UPDATE):** `bikePassID`, `subscriptiontypeID`, `ingangsdatum`, `afloopdatum`, `kosten`, `isActief`, `plekID`, `exploitantID`, etc.

**Bron:** `application.service.saveSubscription()`, `BaseRestService.koppelpas()`

---

### 9. accounts

**Doel:** Klantaccounts (saldo, datum laatste saldo-update).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| addSaldo | ✅ | ✅ | ❌ |
| addSaldos | ✅ | ✅ | ❌ |
| addJsonSaldo | ✅ | ❌ | ❌ |
| addJsonSaldos | ✅ | ❌ | ❌ |
| uploadTransaction (met amountpaid) | ✅ | ✅ | ✅ |
| addSubscription | ✅ | ✅ | ✅ |
| subscribe | ✅ | ✅ | ❌ |
| koppelpas_* | ❌ | ❌ | ✅ |

**Velden (UPDATE):** `saldo`, `dateLastSaldoUpdate` (via recalculateAccountBalance)

**Bron:** Queue-processor (wachtrij_betalingen), `application.service.saveAccount()`, `BikeparkServiceImpl.saveFinancialTransaction()`

---

### 10. accounts_pasids

**Doel:** Pas-IDs (sleutelhangers, OV-chip, etc.) gekoppeld aan accounts.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| saveBike | ✅ | ✅ | ❌ |
| saveBikes | ✅ | ✅ | ❌ |
| saveJsonBike | ✅ | ❌ | ❌ |
| saveJsonBikes | ✅ | ❌ | ❌ |
| syncSector | ✅ | ✅ | ❌ |
| occupationAndSync (met bikes) | ❌ | ❌ | ✅ |
| subscribe | ✅ | ✅ | ❌ |
| koppelpas_* | ❌ | ❌ | ✅ |

**Velden (INSERT/UPDATE):** `PasID`, `Pastype`, `AccountID`, `Naam`, `barcodeFiets`, `huidigeFietsenstallingId`, `huidigeSectieId`, etc.

**Bron:** Queue-processor (wachtrij_pasids, wachtrij_sync), `application.service.saveBikepass()`, `BaseRestService.koppelpas()`

---

### 11. financialtransactions

**Doel:** Financiële transacties (betalingen, abonnementen).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| addSaldo | ✅ | ✅ | ❌ |
| addSaldos | ✅ | ✅ | ❌ |
| addJsonSaldo | ✅ | ❌ | ❌ |
| addJsonSaldos | ✅ | ❌ | ❌ |
| uploadTransaction (met amountpaid) | ✅ | ✅ | ✅ |
| addSubscription | ✅ | ✅ | ✅ |

**Velden (INSERT):** `accountID`, `amount`, `transactionDate`, `code`, `status`, `subscriptionID`, `subscriptiontypeID`, `bikeparkID`, `paidTo`, `source`, `target`, etc.

**Bron:** Queue-processor (wachtrij_betalingen), `BikeparkServiceImpl.saveFinancialTransaction()`

---

### 12. transacties

**Doel:** Verwerkte stallingstransacties (check-in/out).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| uploadTransaction | ✅ | ✅ | ✅ |
| uploadTransactions | ✅ | ✅ | ❌ |
| uploadJsonTransaction | ✅ | ❌ | ❌ |
| uploadJsonTransactions | ✅ | ❌ | ❌ |
| uploadTransactionPlace | ❌ | ❌ | ✅ |
| uploadCompletedTransactionBikepark | ❌ | ❌ | ✅ |
| uploadCompletedTransactionSection | ❌ | ❌ | ✅ |
| syncSector | ✅ | ✅ | ❌ |
| occupationAndSync (met bikes) | ❌ | ❌ | ✅ |
| updateLocker (statuscode 0 of 1) | ✅ | ✅ | ❌ |

**Velden (INSERT/UPDATE):** `PasID`, `FietsenstallingID`, `SectieID`, `PlaceID`, `Date_checkin`, `Date_checkout`, `Stallingskosten`, `BikeTypeID`, `ClientTypeID`, etc.

**Bron:** Queue-processor (wachtrij_transacties, wachtrij_sync), `application.service.uploadTransactionObject()`

---

### 12b. transacties_archief

**Doel:** Gearchiveerde stallingstransacties (na afronding). Wordt gevuld door de queue-processor bij afronding van transacties.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| uploadTransaction | ✅ | ✅ | ✅ |
| uploadTransactions | ✅ | ✅ | ❌ |
| uploadJsonTransaction | ✅ | ❌ | ❌ |
| uploadJsonTransactions | ✅ | ❌ | ❌ |
| uploadTransactionPlace | ❌ | ❌ | ✅ |
| uploadCompletedTransactionBikepark | ❌ | ❌ | ✅ |
| uploadCompletedTransactionSection | ❌ | ❌ | ✅ |
| syncSector | ✅ | ✅ | ❌ |
| occupationAndSync (met bikes) | ❌ | ❌ | ✅ |
| updateLocker (statuscode 0 of 1) | ✅ | ✅ | ❌ |

**Bron:** Queue-processor (wachtrij_transacties, wachtrij_sync)

---

### 13. reserveringen / abonnementen (plekgebonden) *(fietskluizen)*

**Doel:** Kluisreserveringen (statuscode 3 bij updateLocker). Worden opgeslagen als place-bound abonnementen in `abonnementen` (met `plekID`). Alleen van toepassing op fietskluizen; zie [Bijlage A](#bijlage-a-fietskluizen).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| updateLocker (statuscode 3) | ✅ | ✅ | ❌ |

**Velden (INSERT/UPDATE):** `plekID`, `AccountID`, `ingangsdatum`, `afloopdatum`, `bikepassID`, etc. (via `abonnementen`)

**Bron:** `application.service.createReservation()`, `application.service.saveReservation()` (subscriptionDao)

---

### 14. webservice_log

**Doel:** Logging van API-aanroepen.

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| doLog (intern bij diverse methodes) | ✅ | ✅ | ✅ |

**Velden (INSERT):** `tijdstip`, `method`, `bikeparkID`, `logtekst`, `logtekst2`, `ms`

**Bron:** `BaseFMSService.doLog()`

---

### 15. fmsservicelog *(fietskluizen)*

**Doel:** Logging van acties op plaatsen (deur open, pas aangeboden, etc.). Alleen van toepassing op fietskluizen; zie [Bijlage A](#bijlage-a-fietskluizen).

| API-methode | v2 | v3 FMS | v3 REST |
|-------------|----|--------|---------|
| log_place | ❌ | ❌ | ✅ |
| action | ❌ | ❌ | ✅ |

**Velden (INSERT):** `bikeparkID`, `sectionID`, `plekID`, `passID`, `passType`, `timestamp`, `description`, `action`/`actionID`, `type`

**Bron:** `BaseRestService.log()`, `BaseRestService.actions()`

---

## Samenvatting per API-versie

| Tabel | v2 | v3 FMS | v3 REST |
|-------|----|--------|---------|
| wachtrij_transacties | ✅ | ✅ | ✅ |
| wachtrij_pasids | ✅ | ✅ | ❌ |
| wachtrij_betalingen | ✅ | ✅ | ✅ |
| bezettingsdata_tmp | ✅ | ✅ | ✅ |
| fietsenstalling_sectie | ✅ | ✅ | ✅ |
| abonnementen | ✅ | ✅ | ✅ |
| accounts | ✅ | ✅ | ✅ |
| accounts_pasids | ✅ | ✅ | ✅ |
| financialtransactions | ✅ | ✅ | ✅ |
| transacties | ✅ | ✅ | ✅ |
| transacties_archief | ✅ | ✅ | ✅ |
| webservice_log | ✅ | ✅ | ✅ |

*Plek-gerelateerde tabellen (fietsenstalling_plek, wachtrij_sync, reserveringen, fmsservicelog) staan in [Bijlage A: Fietskluizen](#bijlage-a-fietskluizen).*

---

## Verwerkingsflow

De API schrijft naar wachtrij-tabellen en cache-tabellen. De queue-processor en cronjob verwerken deze naar de eindtabellen:

| Buffer | Verwerker | Eindtabellen |
|--------|-----------|--------------|
| wachtrij_transacties | queue-processor | transacties, transacties_archief, fietsenstalling_sectie (bezetting) |
| wachtrij_pasids | queue-processor | accounts_pasids, accounts |
| wachtrij_betalingen | queue-processor | financialtransactions, accounts |
| bezettingsdata_tmp | cronjob | bezettingsdata |

*Plek-gerelateerde flow (wachtrij_sync → transacties, accounts_pasids, fietsenstalling_plek) staat in [Bijlage A: Fietskluizen](#bijlage-a-fietskluizen).*

De wachtrijen zorgen voor retry bij fouten; de API-aanroep leidt tot dezelfde eindresultaten als bij directe verwerking.

---

## Broncode-referenties

| Component | Pad |
|-----------|-----|
| BaseFMSService | `broncode/remote/BaseFMSService.cfc` |
| TransactionGateway | `broncode/cflib/nl/fietsberaad/persistence/TransactionGateway.cfc` |
| BikeparkServiceImpl | `broncode/cflib/nl/fietsberaad/service/BikeparkServiceImpl.cfc` |
| OccupationDao | `broncode/cflib/nl/fietsberaad/persistence/OccupationDao.cfc` |
| BaseRestService | `broncode/remote/REST/BaseRestService.cfc` |
| v3 fms_service | `broncode/remote/REST/v3/fms_service.cfc` |

---

## Operation groups

API-operaties gegroepeerd op dezelfde set target fields. Elke groep heeft een representatieve naam.

| Groep | API-operaties | Target tabellen |
|-------|---------------|-----------------|
| **Stallingstransactie** | uploadTransaction, uploadTransactions, uploadJsonTransaction, uploadJsonTransactions, uploadTransactionPlace, uploadCompletedTransactionBikepark, uploadCompletedTransactionSection | transacties, transacties_archief, fietsenstalling_sectie (Bezetting) |
| **Pasregistratie** | saveBike, saveBikes, saveJsonBike, saveJsonBikes | accounts_pasids |
| **Saldo-opwaardering** | addSaldo, addSaldos, addJsonSaldo, addJsonSaldos, uploadTransaction (met amountpaid) | financialtransactions, accounts |
| **Bezettingsdata** | reportOccupationData, occupationAndSync (met occupation), setOccupation | bezettingsdata, fietsenstalling_sectie (Bezetting) |
| **Abonnement** | addSubscription, addSubscriptionPlace | abonnementen, accounts, financialtransactions |
| **Abonnement + pas** | subscribe | abonnementen, accounts, accounts_pasids |

*Plek-gerelateerde groepen (fietskluizen) staan in [Bijlage A: Fietskluizen](#bijlage-a-fietskluizen).*

---

### Transactie-core (detail)

Het Transactie-core cluster omvat check-in/out, archief en sectiebezetting.

**API-methodes:** uploadTransaction, uploadTransactions, uploadTransactionPlace (→ wachtrij → queue-processor → transacties); uploadCompletedTransactionBikepark, uploadCompletedTransactionSection (→ transacties_archief direct); archive_transactions.cfm (cronjob: transacties → transacties_archief).

**Afnemer:** De transacties zijn de bron voor de FMS-path in update-bezettingsdata (zie [Bezettingsdata](#bezettingsdata-detail)): checkins/checkouts per interval worden geaggregeerd naar bezettingsdata. Wanneer en hoe die actie wordt uitgevoerd staat in de Bezettingsdata-sectie.

| Tabel | Veld | Type | Wijziging via |
|-------|------|------|---------------|
| transacties | FietsenstallingID | direct | uploadTransaction*: `locationid` uit URL. |
| transacties | PasID | direct | uploadTransaction*: `idcode` of `passID`. |
| transacties | PlaceID | direct | uploadTransactionPlace: `placeid` uit URL. uploadTransaction*: `placeID` in body. |
| transacties | SectieID | direct | uploadTransaction*: `sectionid` uit URL of `sectionID` in body. |
| transacties | Date_checkin | direct / berekend | uploadTransaction*: `transactionDate` bij type In. Of berekend (controle-uit: date_checkout - 180 min). |
| transacties | Date_checkout | direct / afgeleid | uploadTransaction*: `transactionDate` bij type Out. Of bij sync: wanneer een fiets in de sectie stond maar niet meer in de sync-lijst staat, wordt de open transactie afgesloten met de sync-timestamp als checkout (geen expliciete check-out van de FMS). |
| transacties | Stallingskosten | direct / berekend | uploadTransaction*: `price` (optioneel). Of berekend via getCost() op basis van tariefstaffels. |
| transacties_archief | biketypeid | direct | uploadCompletedTransaction*: `biketypeid` (optioneel, default 1). archive_transactions: BikeTypeID uit transacties. |
| transacties_archief | checkindate | direct | uploadCompletedTransaction*: `checkindate`. archive_transactions: Date_checkin uit transacties. |
| transacties_archief | checkoutdate | direct | uploadCompletedTransaction*: `checkoutdate`. archive_transactions: Date_checkout uit transacties. |
| transacties_archief | clienttypeid | direct | uploadCompletedTransaction*: `clienttypeid` (optioneel, default 0). archive_transactions: ClientTypeID uit transacties. |
| transacties_archief | citycode | direct | uploadCompletedTransaction*: `citycode` uit URL. archive_transactions: ZipID uit transacties. |
| transacties_archief | locationid | direct | uploadCompletedTransaction*: `locationid` uit URL. archive_transactions: FietsenstallingID uit transacties. |
| transacties_archief | placeid | direct | uploadCompletedTransaction*: `placeid` uit URL (optioneel). archive_transactions: PlaceID uit transacties. |
| transacties_archief | price | direct | uploadCompletedTransaction*: `price`. archive_transactions: stallingskosten uit transacties. |
| transacties_archief | sectionid | direct | uploadCompletedTransaction*: `sectionid` uit URL. archive_transactions: SectieID uit transacties. |
| transacties_archief | sectionid_out | direct | uploadCompletedTransaction*: `sectionid` uit URL. archive_transactions: SectieID_uit uit transacties. |
| transacties | BikeTypeID | afgeleid | uploadTransaction*: `bikeTypeID` (optioneel, default 1). Afgeleid van bikepass bij verwerking. |
| transacties | ClientTypeID | afgeleid | uploadTransaction*: `clientTypeID` (optioneel, default 0). Of afgeleid via getClientType(bikepass, bikepark, timestamp). |
| transacties_archief | daybeginsat | afgeleid | uploadCompletedTransaction*: bikepark.getCouncil().getDayBeginsAt(). archive_transactions: contacts.DayBeginsAt. |
| transacties_archief | exploitantid | afgeleid | uploadCompletedTransaction*: bikepark.getExploitantID(). archive_transactions: ExploitantID uit transacties. |
| transacties_archief | source | afgeleid / direct | uploadCompletedTransaction*: GetAuthUser(). archive_transactions: 'FMS'. |
| transacties_archief | created | berekend / direct | uploadCompletedTransaction*: now(). archive_transactions: dateCreated uit transacties. |
| transacties_archief | modified | berekend / direct | uploadCompletedTransaction*: now(). archive_transactions: dateModified uit transacties. |
| fietsenstalling_sectie | Bezetting | berekend | uploadTransaction* (type In): +1. uploadTransaction* (type Out): -1. Alleen als occupationSource=FMS. Sync-transacties uitgesloten (ColdFusion: typeCheck neq "sync"). |
| transacties_archief | externalplaceid | other | uploadCompletedTransaction*: niet direct (placeid wel). archive_transactions: externalplaceid uit transacties. |
| transacties_archief | reservationtime | other | archive_transactions: Reserveringsduur uit transacties. (uploadCompletedTransaction: niet) |

**Type:** *direct* = 1-op-1 kopie van aangeleverde info; *afgeleid* = uit lookup/join/andere entiteit; *berekend* = formule, now(), getCost(); *other* = overig (gemengd, niet van toepassing, of speciaal geval).

*uploadTransaction = uploadTransaction, uploadTransactions, uploadTransactionPlace (via wachtrij + queue-processor). uploadCompletedTransaction* = uploadCompletedTransactionBikepark, uploadCompletedTransactionSection.

**Bezetting bij synchronisatieslag:** Bij sync (syncSector, occupationAndSync, wachtrij_sync) worden transacties aangemaakt/afgesloten met `Type_checkin`/`Type_checkout` = "sync". ColdFusion sluit sync-transacties uit van de +1/-1 Bezetting-update ("syncs zijn te onzeker"). Bezetting wordt dus **niet direct** aangepast tijdens de sync-slag. Herijking gebeurt later via `resetOccupations.cfm` (ColdFusion): Bezetting = aantal open transacties + wachtrij_in − wachtrij_uit per sectie. Next.js: putTransaction en processSync doen geen Bezetting-update; herijking ontbreekt nog.

---

## Bijlage B: Fietskluizen

De volgende operaties, clusters en target fields gelden **alleen voor fietskluizen** (stallingen met individuele plekken/kluizen). Ze zijn niet van toepassing op andere fietsenstallingtypes (bijv. open stallingen zonder vaste plekken).

### Verwerkingsflow (fietskluizen)

| Buffer | Verwerker | Eindtabellen |
|--------|-----------|--------------|
| wachtrij_sync | queue-processor | transacties, accounts_pasids, fietsenstalling_plek |

### Operation groups (fietskluizen)

| Groep | API-operaties | Target tabellen |
|-------|---------------|-----------------|
| **Stallingstransactie + plekstatus** | updateLocker (statuscode 0 of 1) | transacties, transacties_archief, fietsenstalling_sectie (Bezetting), fietsenstalling_plek (bikeParked, isActief, isGeblokkeerd) |
| **Sectiesynchronisatie** | syncSector, occupationAndSync (met bikes) | transacties, accounts_pasids, fietsenstalling_plek |
| **Plek-eigenschappen** | setUrlWebserviceForLocker, updatePlace | fietsenstalling_plek (urlwebservice, titel, status, dateLastStatusUpdate, username, password) |
| **Pas-koppeling** | koppelpas_location, koppelpas_section, koppelpas_place | abonnementen, accounts, accounts_pasids, fietsenstalling_plek |
| **Kluisreservering** | updateLocker (statuscode 3) | abonnementen (plekgebonden) |
| **Plekstatus** | updateLocker (statuscode 2, 3, 4) | fietsenstalling_plek (isActief, isGeblokkeerd) |
| **Plek-actielog** | log_place, action | fmsservicelog |

**Opmerking:** updateLocker heeft meerdere gedragingen: 0/1 = transactie + plekstatus, 2/3/4 = alleen plekstatus, 3 = ook kluisreservering in abonnementen.

### Clusters (fietskluizen)

#### Clustermatrix (groep × tabel)

| Groep | transacties | transacties_archief | fietsenstalling_sectie | fietsenstalling_plek | accounts_pasids | accounts | abonnementen | fmsservicelog |
|-------|:-----------:|:-------------------:|:----------------------:|:-------------------:|:---------------:|:--------:|:-------------:|:-------------:|
| Stallingstransactie + plekstatus | * | * | * | * | | | | |
| Sectiesynchronisatie | * | | | * | * | | | |
| Plek-eigenschappen | | | | * | | | | |
| Pas-koppeling | | | | * | * | * | * | |
| Kluisreservering | | | | | | | * | |
| Plekstatus | | | | * | | | | |
| Plek-actielog | | | | | | | | * |

#### Clusterbeschrijvingen

| Cluster | Groepen | Velden (tabel.veld) | Domein |
|---------|---------|---------------------|--------|
| **Plek-status** | Stallingstransactie + plekstatus, Sectiesynchronisatie, Plekstatus, Pas-koppeling | fietsenstalling_plek.{bikeParked, isActief, isGeblokkeerd} | Welke fiets waar staat, actief/geblokkeerd |
| **Plek-configuratie** | Plek-eigenschappen | fietsenstalling_plek.{urlwebservice, titel, status, dateLastStatusUpdate, username, password} | URL, naam, credentials van plek |
| **Kluisreservering** | Kluisreservering, Pas-koppeling | abonnementen.* (plekgebonden) | Reservering van kluis aan pas |
| **Plek-actielog** | Plek-actielog | fmsservicelog.* | Log van acties op plek (v3 REST) |

### Target fields (fietskluizen)

| Tabel | Veld | Plek-status | Plek-configuratie | Kluisreservering | Plek-actielog |
|-------|------|:------------:|:-----------------:|:-----------------:|:--------------:|
| abonnementen | afloopdatum | | | * | |
| abonnementen | bikepassID | | | * | |
| abonnementen | exploitantID | | | * | |
| abonnementen | ingangsdatum | | | * | |
| abonnementen | isActief | | | * | |
| abonnementen | plekID | | | * | |
| abonnementen | prijsInclBtw | | | * | |
| abonnementen | subscriptiontypeID | | | * | |
| accounts | dateLastSaldoUpdate | | | * | |
| accounts | saldo | | | * | |
| accounts_pasids | AccountID | | | * | |
| accounts_pasids | Naam | | | * | |
| accounts_pasids | PasID | | | * | |
| accounts_pasids | Pastype | | | * | |
| accounts_pasids | barcodeFiets | | | * | |
| accounts_pasids | huidigeFietsenstallingId | * | | * | |
| accounts_pasids | huidigeSectieId | * | | * | |
| fietsenstalling_plek | bikeParked | * | | | |
| fietsenstalling_plek | dateLastStatusUpdate | | * | | |
| fietsenstalling_plek | isActief | * | | | |
| fietsenstalling_plek | isGeblokkeerd | * | | | |
| fietsenstalling_plek | password | | * | | |
| fietsenstalling_plek | status | | * | | |
| fietsenstalling_plek | titel | | * | | |
| fietsenstalling_plek | urlwebservice | | * | | |
| fietsenstalling_plek | username | | * | | |
| fmsservicelog | Actie | | | | * |
| fmsservicelog | ActieID | | | | * |
| fmsservicelog | Omschrijving | | | | * |
| fmsservicelog | PasID | | | | * |
| fmsservicelog | Pastype | | | | * |
| fmsservicelog | PlekID | | | | * |
| fmsservicelog | SectieID | | | | * |
| fmsservicelog | StallingsID | | | | * |
| fmsservicelog | Tijdstip | | | | * |
| fmsservicelog | Type | | | | * |
| transacties | BikeTypeID | * | | | |
| transacties | ClientTypeID | * | | | |
| transacties | Date_checkin | * | | | |
| transacties | Date_checkout | * | | | |
| transacties | FietsenstallingID | * | | | |
| transacties | PasID | * | | | |
| transacties | PlaceID | * | | | |
| transacties | SectieID | * | | | |
| transacties | Stallingskosten | * | | | |
| transacties_archief | biketypeid | * | | | |
| transacties_archief | checkindate | * | | | |
| transacties_archief | checkoutdate | * | | | |
| transacties_archief | clienttypeid | * | | | |
| transacties_archief | citycode | * | | | |
| transacties_archief | created | * | | | |
| transacties_archief | daybeginsat | * | | | |
| transacties_archief | externalplaceid | * | | | |
| transacties_archief | exploitantid | * | | | |
| transacties_archief | locationid | * | | | |
| transacties_archief | modified | * | | | |
| transacties_archief | placeid | * | | | |
| transacties_archief | price | * | | | |
| transacties_archief | reservationtime | * | | | |
| transacties_archief | sectionid | * | | | |
| transacties_archief | sectionid_out | * | | | |
| transacties_archief | source | * | | | |
