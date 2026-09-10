# FMS REST API v4

**Versie:** 4.0.0

Gegenereerd op 10 september 2026, 13:30 CEST uit `src/lib/openapi/fms-api-v4.json`.
Interactieve referentie: /docs/api/v4

Fietsenstallingen Management Service REST API (V4).

Basispad: `/api/fms/v4/...`.

## Toegang (authenticatie)

De API gebruikt **HTTP Basic Auth**. Endpoints zonder slotje zijn openbaar;
endpoints met een slotje vereisen geldige credentials én het juiste recht
(`permit`) voor de betreffende stalling.

Er zijn twee soorten accounts:

- **Dataleverancier-/operator-credentials** (per stalling/operator) voor de
  FMS REST API (v4). Deze worden in FMS beheerd onder *Dataleveranciers*
  en hebben per stalling een `permit`.
- **Gebruikersaccounts** (security_users) voor de datastandaard- en
  rapportage-API, op basis van de rol van de gebruiker.

## Rechten: lezen vs. schrijven

De FMS REST endpoints hanteren `permit`-niveaus per stalling:

| Permit | Betekenis |
| --- | --- |
| `operator` | Alle rechten (lezen én schrijven) |
| `dataprovider.type1` | Inventarisatie/sync (`occupation` met `bikes`) |
| `dataprovider.type2` | `managedtransactions` + bezettingsdata |

- **Openbaar leesbaar** (geen auth): catalogus van gemeenten, locaties,
  secties, plekken en abonnementsvormen, plus de algemene keuzelijsten
  (fietstypen, betalingstypen, klanttypen, servertijd).
- **Beschermde velden**: alleen zichtbaar met het `operator`-permit. Zonder
  permit krijgt u een uitgeklede weergave (geen foutmelding).
- **Gevoelige reads** (saldi, abonnementen): vereisen het `operator`-permit.
- **Schrijfacties** (POST/PUT/DELETE): vereisen het `operator`-permit.
  Uitzonderingen: `managedtransactions` en `occupation` vereisen
  `operator` of `dataprovider.type2`; sync via `occupation`+`bikes` accepteert ook `dataprovider.type1`.

## Catalogus

**Catalogus** is naslagdata: u vraagt op *wat er is*, niet om een check-in
of andere mutatie te doen.

- **Algemene catalogus** — keuzelijsten voor de hele dienst, niet gekoppeld
  aan één stalling: `GET /v4/servertime`, `/v4/biketypes`,
  `/v4/paymenttypes`, `/v4/clienttypes`.
  JSON-keys zijn kleine letters (`id`, `name`, `singular`). Eén fietstype
  ophalen: `GET /v4/biketypes` en filteren op `id` (er is geen
  `/v4/biketypes/{id}`).
- **Stallingscatalogus** — de boom van een gemeente en haar stallingen:
  `GET /v4/citycodes`, locaties, secties, plekken, abonnementsvormen.

## Transacties (v4)

Stallingstransacties worden uitsluitend via `managedtransactions` aangeleverd.
Legacy in/out (`transactions`), `completedtransactions`, fietskluizen-writes,
`isAllowedToUse` en koppelpas op plek-niveau geven HTTP 410.

## Migratie vanaf v2 of v3

- [V2 → V4](/test/fms-api-docs-migrate-v2)
- [V3 → V4](/test/fms-api-docs-migrate-v3)

## Servers

| URL | Beschrijving |
| --- | --- |
| `/api/fms` | FMS REST API v4 |

## Authenticatie

- **basicAuth** (http / basic) — HTTP Basic Auth (UrlName + Password uit contacts)

Standaard (tenzij een endpoint `security: []` heeft): HTTP Basic Auth.

## Endpoints

- [GET /v4/servertime](#get-v4-servertime)
- [GET /v4/biketypes](#get-v4-biketypes)
- [GET /v4/paymenttypes](#get-v4-paymenttypes)
- [GET /v4/clienttypes](#get-v4-clienttypes)
- [GET /v4/citycodes](#get-v4-citycodes)
- [GET /v4/citycodes/{citycode}](#get-v4-citycodes-citycode)
- [GET /v4/citycodes/{citycode}/locations/{locationid}](#get-v4-citycodes-citycode-locations-locationid)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/sections](#get-v4-citycodes-citycode-locations-locationid-sections)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}](#get-v4-citycodes-citycode-locations-locationid-sections-sectionid)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/subscriptiontypes](#get-v4-citycodes-citycode-locations-locationid-subscriptiontypes)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance](#get-v4-citycodes-citycode-locations-locationid-idcodes-idtype-idcode-balance)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance](#post-v4-citycodes-citycode-locations-locationid-idcodes-idtype-idcode-balance)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/balances](#get-v4-citycodes-citycode-locations-locationid-balances)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/subscriptions](#get-v4-citycodes-citycode-locations-locationid-subscriptions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/subscriptions](#post-v4-citycodes-citycode-locations-locationid-subscriptions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/subscriptions/{subscriptionid}](#post-v4-citycodes-citycode-locations-locationid-subscriptions-subscriptionid)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/bikeupdates](#get-v4-citycodes-citycode-locations-locationid-bikeupdates)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/bikes](#get-v4-citycodes-citycode-locations-locationid-bikes)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/completedtransactions](#post-v4-citycodes-citycode-locations-locationid-completedtransactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/transactions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-transactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/completedtransactions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-completedtransactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/transactions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-transactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/managedtransactions](#post-v4-citycodes-citycode-locations-locationid-managedtransactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}](#post-v4-citycodes-citycode-locations-locationid-idcodes-idtype-idcode)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/bike](#post-v4-citycodes-citycode-locations-locationid-idcodes-idtype-idcode-bike)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/managedtransactions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-managedtransactions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/occupation](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-occupation)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#get-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [PUT /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#put-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/logs](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-logs)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/actions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-actions)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/subscriptions](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-subscriptions)
- [GET /v4/citycodes/{citycode}/locations](#get-v4-citycodes-citycode-locations)
- [GET /v4/citycodes/{citycode}/locationscsv](#get-v4-citycodes-citycode-locationscsv)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places](#get-v4-citycodes-citycode-locations-locationid-sections-sectionid-places)
- [GET /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}](#get-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-idcodes-idtype-idcode)
- [POST /v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}](#post-v4-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-idcodes-idtype-idcode)

## GET `/v4/servertime`

**Server tijd (algemene catalogus)**

Tags: V4

Auth: openbaar (geen auth)

### Responses

**200** — ISO 8601 timestamp

`application/json`

`string (date-time)` — date-time

## GET `/v4/biketypes`

**Alle fietstypen (algemene catalogus)**

Tags: V4

Auth: openbaar (geen auth)

### Responses

**200** — Array van fietstypen (`id`, `name`, `singular`). Eén type ophalen door te filteren op `id` (geen aparte `/biketypes/{id}`).

`application/json`

array van:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `id` | integer | nee |  |
  | `name` | string | nee |  |
  | `singular` | string | nee |  |

## GET `/v4/paymenttypes`

**Betalingstypen (algemene catalogus)**

Tags: V4

Auth: openbaar (geen auth)

### Responses

**200** — Array van betalingstypen

`application/json`

array van:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `paymenttypeid` | integer | nee |  |
  | `name` | string | nee |  |
  | `description` | string | nee |  |

## GET `/v4/clienttypes`

**Klanttypen (algemene catalogus)**

Algemene catalogus van klanttypen (`id`, `name`).

Tags: V4

Auth: openbaar (geen auth)

### Responses

**200** — Array van klanttypen

`application/json`

array van:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `id` | integer | nee |  |
  | `name` | string | nee |  |

## GET `/v4/citycodes`

**Lijst van citycodes (gemeenten)**

Tags: V4

Auth: openbaar (geen auth)

### Responses

**200** — Array van citycodes

`application/json`

array van:
  `CityCode` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}`

**Gemeente met locaties**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |

### Responses

**200** — Gemeente inclusief locaties

`application/json`

`CityWithLocations` (zie [Schemas](#schemas))

**404** — Niet gevonden

## GET `/v4/citycodes/{citycode}/locations/{locationid}`

**Eén locatie**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `fields` | query | nee | string |  |
| `depth` | query | nee | integer |  |

### Responses

**200** — Locatie

`application/json`

`LocationSummary` (zie [Schemas](#schemas))

**404** — Niet gevonden

## GET `/v4/citycodes/{citycode}/locations/{locationid}/sections`

**Sectoren op locatie**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `fields` | query | nee | string |  |
| `depth` | query | nee | integer |  |

### Responses

**200** — Array van sectoren

`application/json`

array van:
  `object`

## GET `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}`

**Eén sector**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `fields` | query | nee | string |  |
| `depth` | query | nee | integer |  |

### Responses

**200** — Sector

`application/json`

`object`

## GET `/v4/citycodes/{citycode}/locations/{locationid}/subscriptiontypes`

**Abonnementsvormen op locatie**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Responses

**200** — Array van abonnementsvormen

`application/json`

array van:
  `object`

## GET `/v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance`

**Saldo voor één ID-middel (operator)**

Tags: V4 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `idtype` | path | ja | integer |  |
| `idcode` | path | ja | string |  |

### Responses

**200** — Saldo

`application/json`

`V3BalanceEntry` (zie [Schemas](#schemas))

**401** — Unauthorized

## POST `/v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance`

**Saldo opwaarderen**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `idtype` | path | ja | integer |  |
| `idcode` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `amount` | number | ja |  |
| `paymenttypeid` | integer | nee |  |
| `transactiondate` | string (date-time) | nee |  |

### Responses

**200** — In wachtrij gezet

`application/json`

`Result` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locations/{locationid}/balances`

**Saldi in gemeente (operator)**

Tags: V4 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Responses

**200** — Array van saldi

`application/json`

array van:
  `V3BalanceEntry` (zie [Schemas](#schemas))

**401** — Unauthorized

## GET `/v4/citycodes/{citycode}/locations/{locationid}/subscriptions`

**Abonnementen op locatie (operator)**

Tags: V4 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Responses

**200** — Array van abonnementen

`application/json`

array van:
  `V3SubscriptionEntry` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/subscriptions`

**Abonnement toevoegen**

Vereist ENABLE_WRITE_API en Basic Auth (operator of dataprovider.type2).

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Request body

Verplicht.

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscription` | V3SubscriptionWrite | nee |  |

### Responses

**200** — Resultaat

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/subscriptions/{subscriptionid}`

**Pas koppelen aan bestaand abonnement**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `subscriptionid` | path | ja | integer |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `idcode` | string | ja |  |
| `idtype` | integer | nee |  |

### Responses

**200** — Resultaat

`application/json`

`Result` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locations/{locationid}/bikeupdates`

**Fietsmutaties sinds tijdstip**

Tags: V4 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `from` | query | nee | string (date-time) |  |

### Responses

**200** — Mutaties

`application/json`

`V3BikeUpdatesResponse` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locations/{locationid}/bikes`

**Geregistreerde fietsen (barcoderegister)**

Geeft `{barcode, biketypeid}` voor de gemeente van de stalling.
Vereist operator Basic Auth.

Tags: V4 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Responses

**200** — Array van fietsen

`application/json`

array van:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `barcode` | string | nee |  |
  | `biketypeid` | integer | nee |  |

**401** — Unauthorized

## POST `/v4/citycodes/{citycode}/locations/{locationid}/completedtransactions`

**Verwijderd in v4 — gebruik managedtransactions**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Responses

**410** — Niet beschikbaar op v4. Gebruik managedtransactions, of v3 voor legacy.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/transactions`

**Verwijderd in v4 — gebruik managedtransactions**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |

### Responses

**410** — Niet beschikbaar op v4. Gebruik managedtransactions, of v3 voor legacy.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/completedtransactions`

**Verwijderd in v4 — gebruik managedtransactions**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |

### Responses

**410** — Niet beschikbaar op v4. Gebruik managedtransactions, of v3 voor legacy.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/transactions`

**Verwijderd in v4 — gebruik managedtransactions**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Niet beschikbaar op v4. Gebruik managedtransactions, of v3 voor legacy.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/managedtransactions`

**Beheerde transactie(s) (bikepark-niveau)**

Enkel record via `managedtransaction`, of batch via `managedtransactions` (array, max 50).
Bij dubbele `externaltransactionid` in één request wint het **laatste** item; alle items worden
eerst gevalideerd (all-or-nothing) voordat iets in de wachtrij komt.

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Request body

`application/json`

Een van:
- Optie 1:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `managedtransaction` | V3ManagedTransaction | ja |  |
- Optie 2:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `managedtransactions` | V3ManagedTransaction[] | ja |  |
- Optie 3:
  array (max 50) van:
    `V3ManagedTransaction` (zie [Schemas](#schemas))

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}`

**Tijdelijke pas koppelen aan definitieve pas (koppelpas)**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `idtype` | path | ja | integer | 3=tijdelijk, 4=tmp_sleutelhanger |
| `idcode` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `newidcodes` | object | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/bike`

**Fiets koppelen aan pas**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `idtype` | path | ja | integer |  |
| `idcode` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `bikeid` | string | ja |  |
| `biketypeid` | integer | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/managedtransactions`

**Beheerde transactie(s) (sector)**

Zelfde contract als bikepark-niveau `managedtransactions`. Default `sectionid` = sector uit URL;
per item overschrijfbaar via `sectionid` / `sectionid_checkin` in het payload.

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |

### Request body

`application/json`

Een van:
- Optie 1:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `managedtransaction` | V3ManagedTransaction | ja |  |
- Optie 2:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `managedtransactions` | V3ManagedTransaction[] | ja |  |
- Optie 3:
  array (max 50) van:
    `V3ManagedTransaction` (zie [Schemas](#schemas))

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/occupation`

**Sector synchroniseren en/of bezetting doorgeven**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `data` | V3OccupationData | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Eén plek**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**200** — Plek

`application/json`

`PlaceSummary` (zie [Schemas](#schemas))

**404** — Niet gevonden

## PUT `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Verwijderd in v4 — fietskluizen (updatePlace / updateLocker)**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen-writes zijn verwijderd in v4.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Verwijderd in v4 — fietskluizen (updatePost)**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen-writes zijn verwijderd in v4.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/logs`

**Verwijderd in v4 — fietskluizen (logs)**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen-writes zijn verwijderd in v4.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/actions`

**Verwijderd in v4 — fietskluizen (actions)**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen-writes zijn verwijderd in v4.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/subscriptions`

**Verwijderd in v4 — abonnement op kluisplek**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen-writes zijn verwijderd in v4.

## GET `/v4/citycodes/{citycode}/locations`

**Locaties in gemeente**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |

### Responses

**200** — Array van locaties

`application/json`

array van:
  `LocationSummary` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locationscsv`

**Locaties in gemeente als CSV-regels**

Geeft per locatie één regel met de enkelvoudige veldwaarden (depth=1),
gescheiden door ";". Object- en array-velden worden overgeslagen.

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `fields` | query | nee | string | Komma-gescheiden veldselectie (zelfde semantiek als locations) |

### Responses

**200** — Array van CSV-regels (één per locatie)

`application/json`

array van:
  `string`

## GET `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places`

**Plekken in sector**

Tags: V4

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |

### Responses

**200** — Array van plekken

`application/json`

array van:
  `PlaceSummary` (zie [Schemas](#schemas))

## GET `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}`

**Verwijderd in v4 — isAllowedToUse**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Fietskluizen/buurt-toegang via FMS REST is verwijderd in v4.

## POST `/v4/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}`

**Verwijderd in v4 — koppelpas op kluisplek**

Tags: V4 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Responses

**410** — Koppelpas op plek-niveau is verwijderd in v4. Gebruik POST …/locations/{id}/idcodes/….

## Schemas

### BikeType

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `bikeTypeID` | integer | nee | 1=fiets, 2=bromfiets, 3=speciaal, 4=elektrisch, 5=motor, 6=mindervaliden |
| `name` | string | nee |  |
| `naamenkelvoud` | string | nee |  |

### PaymentType

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `paymentTypeID` | integer | nee | 1=betaald, 2=kwijtschelding |
| `name` | string | nee |  |

### ClientType

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `clientTypeID` | integer | nee |  |
| `name` | string | nee |  |

### V2BikeTypeLegacy

Legacy v2-vorm van een fietstype (hoofdletter-keys, zoals getJsonBikeTypes).

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `BIKETYPEID` | integer | nee |  |
| `NAME` | string | nee |  |

### PlaceSummary

Publieke velden van een plek.

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `id` | integer | nee |  |
| `name` | string | nee |  |
| `datelaststatusupdate` | string | nee | Alleen aanwezig als er een statusupdate-datum is. |
| `statuscode` | integer | nee | status % 10 — 0=vrij, 1=bezet, 2=abonnement, 3=gereserveerd, 4=buiten werking |

### V3IsAllowedToUse

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `allowed` | boolean | nee |  |
| `messagecode` | string | nee | OK, BLOCKED, RESERVED, PARKED_ELSEWHERE, INVALID_ID |
| `idcode` | string | nee |  |
| `idtype` | integer | nee |  |
| `saldo` | number | nee |  |

### V2BikeTypeInSubscription

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `bikeTypeID` | integer | nee |  |
| `name` | string | nee |  |

### V2SubscriptionType

Abonnementsvorm zoals in v2 `getJsonSubscriptionTypes`.

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscriptionTypeID` | integer | nee |  |
| `name` | string | nee |  |
| `price` | number | nee |  |
| `durationInMonth` | integer | nee | Duur in maanden |
| `bikeTypes` | V2BikeTypeInSubscription[] | nee |  |

### Result

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `message` | string | nee |  |
| `status` | integer | nee |  |
| `id` | integer | nee |  |
| `ids` | integer[] | nee | Wachtrij-IDs bij batch managedtransactions |
| `subscriptionid` | integer | nee |  |

### V3ManagedTransaction

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `externaltransactionid` | string | ja |  |
| `idcode` | string | ja |  |
| `idtype` | integer | nee | 0=sleutelhanger, 1=ovchip, 2=barcodebike |
| `checkindate` | string (date-time) | ja |  |
| `checkintype` | string (user \\| controle \\| system \\| sync \\| reservation) | ja |  |
| `checkoutdate` | string (date-time) | nee |  |
| `checkouttype` | string (user \\| controle \\| system \\| sync \\| reservation) | nee |  |
| `stallingsduur` | integer | nee |  |
| `stallingskosten` | number | nee |  |
| `sectionid` | string | nee |  |
| `sectionid_checkin` | string | nee |  |
| `sectionid_out` | string | nee |  |
| `placeid` | integer | nee |  |
| `externalplaceid` | string | nee |  |
| `bikeid_in` | string | nee |  |
| `bikeid_out` | string | nee |  |
| `biketypeid` | integer | nee |  |
| `clienttypeid` | integer | nee |  |
| `tariefstaffels` | string | nee |  |
| `reserveringsduur` | integer | nee |  |
| `passuuid` | string | nee |  |

### V3SubscriptionWrite

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscriptiontypeid` | integer | ja |  |
| `idcode` | string | ja |  |
| `idtype` | integer | nee |  |
| `startdate` | string | nee |  |
| `expirationdate` | string | nee |  |
| `cost` | number | nee |  |

### V3PlaceProperties

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `urlwebservice` | string | nee |  |
| `name` | string | nee |  |
| `username` | string | nee |  |
| `password` | string | nee |  |
| `statuscode` | integer | nee |  |
| `transactiondate` | string (date-time) | nee |  |
| `cost` | number | nee |  |
| `paymenttypeid` | integer | nee |  |

### V3LogProperties

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `action` | string | nee |  |
| `type` | string | nee |  |
| `timestamp` | string (date-time) | nee |  |
| `idtype` | integer | nee |  |
| `idcode` | string | nee |  |
| `description` | string | nee |  |
| `actionid` | integer | nee |  |

### V3OccupationData

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `transactiondate` | string (date-time) | nee |  |
| `bikes` | object[] | nee |  |
| `occupation` | integer | nee |  |
| `checkins` | integer | nee |  |
| `checkouts` | integer | nee |  |
| `intervalinminutes` | integer | nee |  |

### V3BalanceEntry

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `idcode` | string | nee |  |
| `idtype` | integer | nee |  |
| `balance` | number | nee |  |

### V3SubscriptionEntry

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `idcode` | string | nee |  |
| `idtype` | integer | nee |  |
| `subscriptiontypeid` | integer | nee |  |
| `startdate` | string | nee |  |
| `expirationdate` | string | nee |  |
| `price` | number | nee |  |
| `placeid` | integer | nee |  |

### V3BikeUpdatesResponse

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `citycode` | string | nee |  |
| `from` | string | nee |  |
| `data` | object[] | nee |  |

### CityCode

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `citycode` | string | nee |  |
| `name` | string | nee |  |

### LocationSummary

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `locationid` | string | nee |  |
| `name` | string | nee |  |

### CityWithLocations

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `citycode` | string | nee |  |
| `name` | string | nee |  |
| `locations` | LocationSummary[] | nee |  |
