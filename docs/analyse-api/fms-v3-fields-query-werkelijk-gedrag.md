# FMS V3 REST – queryparameter `fields`: gepubliceerde docs vs. ColdFusion

Dit document beschrijft **waar de gepubliceerde/Open-data-documentatie kan afwijken** van **wat de ColdFusion-implementatie echt doet** (`remote/REST/BaseRestService.cfc`, `remote/REST/v3/fms_service.cfc`). Het is geen handleiding voor een specifieke consumer-stack; integrators kunnen hieruit afleiden welke API-teksten **onvolledig** of **misleidend** zijn ten opzichte van de broncode.

---

## 1. Waarom de documentatie kan afwijken

| Aspect | Vaak in documentatie | In de CF-code |
|--------|----------------------|---------------|
| Voorbeeld `fields=location.occupation` | “Enkel bezettingsdata” | Triggert een **bundel** van vier response-keys op **location**-niveau, niet één veld met de naam `occupation`. |
| JSON-veldnamen | Soms één term “occupation” | **Location** gebruikt `occupied`, `free`, `occupationsource`, `capacity`. **Section** gebruikt `occupation` (niet `occupied`). |
| `*` (alle velden) | Alles in één keer | `location.subscriptiontypes` wordt **niet** geactiveerd door `*` alleen; er moet expliciet `location.subscriptiontypes` in de lijst staan. |
| Performance | “Fields maakt requests sneller” | In CF: **minder werk** (geen getters/struct-onderdelen voor niet-geselecteerde velden). Hoe andere stacks dit nabootsen staat niet in dit document. |

---

## 2. Welke endpoints accepteren `fields` (ColdFusion REST v3)

In `fms_service.cfc` komt `fields` **via query** voor onder meer:

- `GET /citycodes` – lijst gemeenten
- `GET /citycodes/{citycode}`
- `GET /citycodes/{citycode}/locations`
- `GET /citycodes/{citycode}/locationscsv`
- `GET /citycodes/{citycode}/locations/{locationid}`
- `GET /citycodes/{citycode}/locations/{locationid}/sections`

**Geen** `fields`-argument in de REST-component voor o.a.:

- enkel sectie `.../sections/{sectionid}`
- `places`, vele schrijf- en operator-endpoints

(List argumenten zijn `restargsource="query"` waar van toepassing; zie `broncode/remote/REST/v3/fms_service.cfc`.)

---

## 3. Formaat van `fields` (CF)

- **`*`**: alles wat de code op `*` baseert, **behalve** de uitzondering voor `subscriptiontypes` (hieronder).
- Comma-gescheiden lijst, case-insensitive matching in vrijwel alle `ListFindNoCase`-checks.
- **`all`** of **`standard`**: geen CF-keywords in deze bron; verschijnen alleen in externe tooling of documentatie. Alleen gedrag volgens bovenstaande CF-regels is hier beschreven.

---

## 4. City-niveau (`getCity`)

| Onderdeel | Wanneer gezet | Bron / opmerking |
|-----------|---------------|-------------------|
| `citycode` | Altijd | `council.getZipID()` |
| `name` | `*` of `city.name` | `getCompanyName()` |
| `locations` | `depth >= 1` | Array van `getLocation` met **dezelfde** `fields`-string |

Er is **geen** city-brede “bundel” behalve dat onderliggende locaties de location-regels volgen.

---

## 5. Location-niveau (`getLocation` → bikepark)

### 5.1 Altijd aanwezig (ongeacht `fields`)

| JSON-key | CF-bron |
|----------|---------|
| `locationid` | `bikepark.getBikeparkExternalID()` |

### 5.2 Losse velden (één trigger → één logisch antwoord)

| Trigger (`*` of pad) | JSON-key(s) | CF-bron / berekening |
|----------------------|---------------|----------------------|
| `location.name` | `name` | `getTitle()` |
| `location.lat` | `lat` | `ListFirst(getCoordinates())` (alleen als coördinaten niet leeg) |
| `location.long` | `long` | `ListLast(getCoordinates())` |
| `location.exploitantname` | `exploitantname` | `getManager()` via `setIfExists` |
| `location.exploitantcontact` | `exploitantcontact` | `getManagerContact()` |
| `location.address` | `address` | `getLocation()` |
| `location.postalcode` | `postalcode` | `getZip()` |
| `location.city` | `city` | `getCity()` |
| `location.costsdescription` | `costsdescription` | `getDescCost()` |
| `location.thirdpartyreservationsurl` | `thirdpartyreservationsurl` | `getThirdPartyReservationsUrl()` |
| `location.description` | `description` | `getDescription()` |
| `location.station` | `station` | `getIsStationsstalling()` |

### 5.3 Alias-groep (twee tokens → één veld)

| Triggers | JSON-key | CF-bron |
|----------|----------|---------|
| `*`, `location.locationtype`, **of** `location.type` | `locationtype` | `getType()` |

### 5.4 Bezetting / capaciteit – **bundel** (belangrijk t.o.v. docs)

Als **`\*`** of **één** van de volgende tokens voorkomt:

`location.free`, `free`, `location.occupied`, `occupied`, `location.occupation`, `occupation`

dan zet CF **in één blok**:

| JSON-key | CF-bron / berekening |
|----------|----------------------|
| `occupied` | `getOccupiedPlaces()` |
| `free` | `getFreePlaces()` |
| `occupationsource` | `getOccupationSource()` |
| `capacity` | Alleen als `getCapacity() > 0`: `getNettoCapacity()` |

**Gevolg:** `GET .../locations/{id}?fields=location.occupation` levert **niet** “alleen één property occupation”, maar o.a. `locationid` plus **`occupied`**, **`free`**, **`occupationsource`**, en vaak **`capacity`**. Dat is **wel** consistent met de code; een document dat alleen “occupation” noemt is **ongeprecies**.

### 5.5 Alleen capaciteit (aanvullende regel)

Als `capacity` **nog niet** in het resultaat zit:

- en `*` of `location.capacity`
- en `getCapacity() > 0`

→ dan: `capacity = getNettoCapacity()`.

### 5.6 Subscription types – **uitsluiting op `*`**

Alleen als de lijst **`location.subscriptiontypes`** bevat (exacte token; `*` telt **niet**):

- `subscriptiontypes` array, gevuld met `Subscriptiontype`-componenten per `getSubscriptiontypes()`.

### 5.7 Opening hours – hiërarchisch

1. Buitenste gate: `*` **of** substring `location.openinghours` in `fields` (`FindNoCase`).
2. Dan wordt `openinghours` een struct, met deelsets:
   - `opennow` als `*`, of `location.openinghours`, of `location.openinghours.opennow`
   - `periods` als `*`, of `location.openinghours`, of `location.openinghours.periods` (complexe loop per dag)
   - `extrainfo` als `*`, of `ListFind` op `location.openinghours` / `location.openinghours.extrainfo` (**let op:** hier `ListFind`, niet overal case-insensitive zoals `ListFindNoCase`)

### 5.8 Services

| Trigger | JSON-key | CF |
|---------|----------|-----|
| `*` of `location.services` (ListFind) | `services` | `getAllServices()` via `setIfExists` |

### 5.9 Sections ingesloten op location

| Trigger | JSON-key | CF |
|---------|----------|-----|
| `depth > 1` en (`*` of `location.sections`) | `sections` | `getSections(bikepark, …)` → per item `getSection(section, …)` **zonder** `fields` door te geven in de loop |

**Implementatiedetail:** In `getSections` wordt `getSection(...)` aangeroepen zonder `fields`. In `getSection` hangt het bezettingsblok af van `StructKeyExists(arguments, "fields")`. In de **ingesloten** sectielijst onder een location is `fields` daardoor vaak **afwezig** → het voorwaardelijke capacity/occupation-blok in `getSection` wordt dan **niet** uitgevoerd, terwijl andere sectie-onderdelen (zoals `biketypes`, `places`, `rates`) wél worden opgebouwd. **Top-level** `GET .../sections` roept `baseRestService.getSections(..., fields=...)` wel aan, maar die forwardet `fields` evenmin naar `getSection` in de huidige bron. Dit is een **discrepantie in de CF-keten** (niet alleen in de PDF).

---

## 6. Section-niveau (`getSection`)

### 6.1 Vrijwel altijd gezet

| JSON-key | CF |
|----------|-----|
| `sectionid` | `getExternalID()` |
| `name` | `getName()` |

Voor stallingtype **fietskluizen**: `maxsubscriptions` kan gezet worden vanuit de bikepark (`getNumberSubscriptablePlaces()`).

### 6.2 Bezetting – bundel (**alleen als `arguments.fields` bestaat** op de aanroep)

Voorwaarden: `getCapacity() > 0` én `fields` bestaat én (`*` of `section.occupied` of `occupied` of `section.occupation` of `occupation`).

Dan:

| JSON-key | CF-bron / berekening |
|----------|----------------------|
| `capacity` | `section.getCapacity()` |
| `occupation` | `section.getOccupation()` (**niet** de key `occupied`) |
| `free` | `capacity - occupation`, minimum 0 |
| `occupationsource` | `section.getBikepark().getOccupationSource()` |

### 6.3 Overige sectie-inhoud (niet door `fields` begrensd in deze functie)

Zolang de sectie data heeft: `biketypes` (met `rates` per fietstype), optioneel `places` als `depth > 1` en `hasPlace()`, optioneel `rates` bij uniforme bikepark-tarieven. Deze worden **niet** in dezelfde `ListFindNoCase`-stijl achter `fields` gehangen in dit blok; ze volgen de algemene flow van `getSection`.

---

## 7. Samenvatting voor integrators (docs ↔ CF)

1. **`fields` is geen 1-op-1 “property filter”**: meerdere **bundels** en **aliassen** (zoals `location.type` ↔ `locationtype`, `location.occupation` ↔ hele bezettingsbundel op location).
2. **Location vs section**: andere namen voor bezetting (`occupied` vs `occupation`).
3. **`\*` ≠ alles**: `subscriptiontypes` vereist **expliciet** `location.subscriptiontypes`.
4. **Gepubliceerde zinnen** als “alleen bezetting” bij `location.occupation` zijn **te kort**; de code levert een **vaste set** van bezettings-gerelateerde velden op location-niveau.
5. **Ingesloten `sections`** onder een location kunnen qua occupancy/capacity **anders** reageren dan een top-level sections-request door het ontbreken van `fields` op de `getSection`-aanroep in de CF-keten.

---

## 8. Bronverwijzingen in repo

| Bron |
|------|
| `broncode/remote/REST/BaseRestService.cfc` – `getCity`, `getLocation`, `getSections`, `getSection` |
| `broncode/remote/REST/v3/fms_service.cfc` – REST `restargsource="query"` voor `fields` |
| CROW / PDF in `docs/documentatie-crow/` – conceptueel nuttig, **niet** als bron van waarheid voor bundels en uitzonderingen |

*Laatst bijgewerkt op basis van broncode-analyse (geen garantie dat productie-CF niet extra patches heeft buiten deze workspace).*
