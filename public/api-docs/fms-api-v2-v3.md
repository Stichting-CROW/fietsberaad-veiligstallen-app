# FMS REST API

**Versie:** 1.0.0

Gegenereerd op 10 september 2026, 13:30 CEST uit `src/lib/openapi/fms-api.json`.
Interactieve referentie: /test/fms-api-docs

Fietsenstallingen Management Service REST API (**V2 en V3**).

Nieuwe integraties gebruiken **v4** (`/api/fms/v4/...`, zie
`/docs/api/v4`). Migratie: [V2 → V4](/test/fms-api-docs-migrate-v2),
[V3 → V4](/test/fms-api-docs-migrate-v3).

V2-paden: `/REST/v1/...`, `/v2/REST/...` (vaak hoofdletter-keys).
V3-paden: `/rest/v3/...` (kleine letters, resource-URL's).

## Catalogus

**Catalogus** is naslagdata (geen mutaties).

- **Algemene catalogus** — keuzelijsten voor de hele dienst: servertijd,
  fietstypen, betalingstypen, klanttypen.
- **Stallingscatalogus** — gemeenten, locaties, secties, plekken,
  abonnementsvormen.

Op v4 volgt de algemene catalogus de V3-vorm (`{id, name, singular}`),
niet de V2 hoofdletter-keys (`BIKETYPEID`, `NAME`).

Beheerde transacties voor nieuwe integraties staan op **v4**.

## Toegang (authenticatie)

De API gebruikt **HTTP Basic Auth**. Endpoints zonder slotje zijn openbaar;
endpoints met een slotje vereisen geldige credentials én het juiste recht
(`permit`) voor de betreffende stalling.

Er zijn twee soorten accounts:

- **Dataleverancier-/operator-credentials** (per stalling/operator) voor de
  FMS REST API (v2/v3). Deze worden in FMS beheerd onder *Dataleveranciers*
  en hebben per stalling een `permit`.
- **Gebruikersaccounts** (security_users) voor de datastandaard- en
  rapportage-API, op basis van de rol van de gebruiker.

## Rechten: lezen vs. schrijven

De FMS REST endpoints hanteren `permit`-niveaus per stalling:

| Permit | Betekenis |
| --- | --- |
| `operator` | Alle rechten (lezen én schrijven) |
| `dataprovider.type1` | Check-ins/check-outs + bezettingsdata |
| `dataprovider.type2` | Afgeronde transacties + bezettingsdata |

- **Openbaar leesbaar** (geen auth): catalogus van gemeenten, locaties,
  secties, plekken en abonnementsvormen.
- **Beschermde velden**: alleen zichtbaar met het `operator`-permit. Zonder
  permit krijgt u een uitgeklede weergave (geen foutmelding).
- **Gevoelige reads** (saldi, abonnementen): vereisen het `operator`-permit.
- **Schrijfacties** (POST/PUT/DELETE): vereisen het `operator`-permit.
  Uitzonderingen: het synchroniseren van check-ins/check-outs vereist
  `operator` of `dataprovider.type1`; bezettingsdata (`occupation`) vereist
  `operator` of `dataprovider.type2`.

## Servers

| URL | Beschrijving |
| --- | --- |
| `https://remote.veiligstallen.nl` | FMS V2/V3 |
| `/api/fms` | Deze host — v4; zie /docs/api/v4 |

## Authenticatie

- **basicAuth** (http / basic) — HTTP Basic Auth (UrlName + Password uit contacts)

Standaard (tenzij een endpoint `security: []` heeft): HTTP Basic Auth.

## Endpoints

- [GET /v2/getServerTime](#get-v2-getservertime)
- [GET /v2/getJsonBikeTypes](#get-v2-getjsonbiketypes)
- [GET /v2/getJsonBikeType/{bikeTypeID}](#get-v2-getjsonbiketype-biketypeid)
- [GET /v2/getJsonPaymentTypes](#get-v2-getjsonpaymenttypes)
- [GET /v2/getJsonClientTypes](#get-v2-getjsonclienttypes)
- [GET /v2/getJsonSubscriptionTypes/{bikeparkID}](#get-v2-getjsonsubscriptiontypes-bikeparkid)
- [GET /v2/getJsonSectors/{bikeparkID}](#get-v2-getjsonsectors-bikeparkid)
- [GET /v2/getJsonBikes/{bikeparkID}](#get-v2-getjsonbikes-bikeparkid)
- [GET /v2/getJsonBikeUpdates/{bikeparkID}](#get-v2-getjsonbikeupdates-bikeparkid)
- [GET /v2/getJsonSubscriptors/{bikeparkID}](#get-v2-getjsonsubscriptors-bikeparkid)
- [GET /v2/getLockerInfo/{bikeparkID}/{sectionID}/{placeID}](#get-v2-getlockerinfo-bikeparkid-sectionid-placeid)
- [GET /v2/isAllowedToUse/{bikeparkID}/{sectionID}/{placeID}](#get-v2-isallowedtouse-bikeparkid-sectionid-placeid)
- [POST /v2/saveJsonBike/{bikeparkID}](#post-v2-savejsonbike-bikeparkid)
- [POST /v2/saveJsonBikes/{bikeparkID}](#post-v2-savejsonbikes-bikeparkid)
- [POST /v2/uploadJsonTransaction/{bikeparkID}/{sectionID}](#post-v2-uploadjsontransaction-bikeparkid-sectionid)
- [POST /v2/uploadJsonTransactions/{bikeparkID}/{sectionID}](#post-v2-uploadjsontransactions-bikeparkid-sectionid)
- [POST /v2/addJsonSaldo/{bikeparkID}](#post-v2-addjsonsaldo-bikeparkid)
- [POST /v2/addJsonSaldos/{bikeparkID}](#post-v2-addjsonsaldos-bikeparkid)
- [POST /v2/syncSector/{bikeparkID}/{sectionID}](#post-v2-syncsector-bikeparkid-sectionid)
- [POST /v2/reportOccupationData/{bikeparkID}/{sectionID}](#post-v2-reportoccupationdata-bikeparkid-sectionid)
- [POST /v2/addSubscription/{bikeparkID}](#post-v2-addsubscription-bikeparkid)
- [POST /v2/subscribe/{bikeparkID}](#post-v2-subscribe-bikeparkid)
- [PUT /v2/updateLocker/{bikeparkID}/{sectionID}/{placeID}](#put-v2-updatelocker-bikeparkid-sectionid-placeid)
- [POST /v2/updateLocker/{bikeparkID}/{sectionID}/{placeID}](#post-v2-updatelocker-bikeparkid-sectionid-placeid)
- [PUT /v2/setUrlWebserviceForLocker/{bikeparkID}/{sectionID}/{placeID}](#put-v2-seturlwebserviceforlocker-bikeparkid-sectionid-placeid)
- [POST /v2/setUrlWebserviceForLocker/{bikeparkID}/{sectionID}/{placeID}](#post-v2-seturlwebserviceforlocker-bikeparkid-sectionid-placeid)
- [GET /v3/servertime](#get-v3-servertime)
- [GET /v3/biketypes](#get-v3-biketypes)
- [GET /v3/paymenttypes](#get-v3-paymenttypes)
- [GET /v3/citycodes](#get-v3-citycodes)
- [GET /v3/citycodes/{citycode}](#get-v3-citycodes-citycode)
- [GET /v3/citycodes/{citycode}/locations/{locationid}](#get-v3-citycodes-citycode-locations-locationid)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/sections](#get-v3-citycodes-citycode-locations-locationid-sections)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}](#get-v3-citycodes-citycode-locations-locationid-sections-sectionid)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/subscriptiontypes](#get-v3-citycodes-citycode-locations-locationid-subscriptiontypes)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance](#get-v3-citycodes-citycode-locations-locationid-idcodes-idtype-idcode-balance)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/balances](#get-v3-citycodes-citycode-locations-locationid-balances)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/subscriptions](#get-v3-citycodes-citycode-locations-locationid-subscriptions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/subscriptions](#post-v3-citycodes-citycode-locations-locationid-subscriptions)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/bikeupdates](#get-v3-citycodes-citycode-locations-locationid-bikeupdates)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/completedtransactions](#post-v3-citycodes-citycode-locations-locationid-completedtransactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/managedtransactions](#post-v3-citycodes-citycode-locations-locationid-managedtransactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}](#post-v3-citycodes-citycode-locations-locationid-idcodes-idtype-idcode)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/transactions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-transactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/completedtransactions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-completedtransactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/managedtransactions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-managedtransactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/occupation](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-occupation)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#get-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [PUT /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#put-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/logs](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-logs)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/actions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-actions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/transactions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-transactions)
- [POST /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/subscriptions](#post-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-subscriptions)
- [GET /v3/citycodes/{citycode}/locations](#get-v3-citycodes-citycode-locations)
- [GET /v3/citycodes/{citycode}/locationscsv](#get-v3-citycodes-citycode-locationscsv)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places](#get-v3-citycodes-citycode-locations-locationid-sections-sectionid-places)
- [GET /v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}](#get-v3-citycodes-citycode-locations-locationid-sections-sectionid-places-placeid-idcodes-idtype-idcode)

## GET `/v2/getServerTime`

**Server tijd**

V2. Op v4: `GET /api/fms/v4/servertime`.

Tags: V2

Auth: openbaar (geen auth)

### Responses

**200** — V2 geeft een locale datetime-string, geen ISO 8601

`application/json`

`string (date-time)` — date-time

## GET `/v2/getJsonBikeTypes`

**Alle fietstypen**

V2 (`/REST/v1/getBikeTypes`): keys `BIKETYPEID`, `NAME`.
Op v4: `GET /api/fms/v4/biketypes` (`{id, name, singular}`).

Tags: V2

Auth: openbaar (geen auth)

### Responses

**200** — Array van fietstypen (legacy keys BIKETYPEID/NAME)

`application/json`

array van:
  `V2BikeTypeLegacy` (zie [Schemas](#schemas))

## GET `/v2/getJsonBikeType/{bikeTypeID}`

**Eén fietstype**

V2 `getJsonBikeType`. In v4 is er geen `/biketypes/{id}`;
gebruik `GET /api/fms/v4/biketypes` en filter op `id`.

Tags: V2

Auth: openbaar (geen auth)

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeTypeID` | path | ja | integer | ID van het fietstype |

### Responses

**200** — Fietstype (legacy keys BIKETYPEID/NAME)

`application/json`

`V2BikeTypeLegacy` (zie [Schemas](#schemas))

**400** — bikeTypeID ontbreekt

**404** — Fietstype niet gevonden

## GET `/v2/getJsonPaymentTypes`

**Betalingstypen**

V2 (`/REST/v1/getPaymentTypes`): keys `PAYMENTTYPEID`, `NAME`, `DESCRIPTION`.
Op v4: `GET /api/fms/v4/paymenttypes` (`{paymenttypeid, name, description}`).

Tags: V2

Auth: openbaar (geen auth)

### Responses

**200** — Array van betalingstypen (legacy hoofdletter-keys)

`application/json`

array van:
  `PaymentType` (zie [Schemas](#schemas))

## GET `/v2/getJsonClientTypes`

**Klanttypen**

V2 (`/REST/v1/getClientTypes`). Op v4:
`GET /api/fms/v4/clienttypes` (`id`, `name`).

Tags: V2

Auth: openbaar (geen auth)

### Responses

**200** — Array van klanttypen

`application/json`

array van:
  `ClientType` (zie [Schemas](#schemas))

## GET `/v2/getJsonSubscriptionTypes/{bikeparkID}`

**Abonnementsvormen voor stalling**

Geeft de abonnementsvormen die beschikbaar zijn voor de gegeven stalling (proxy.SubscriptionType).
Vereist operator-rechten voor het bikepark (HTTP Basic Auth).

Tags: V2

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string | StallingsID (postcode_volgnummer) |

### Responses

**200** — Array van abonnementsvormen

`application/json`

array van:
  `V2SubscriptionType` (zie [Schemas](#schemas))

**400** — bikeparkID ontbreekt

**401** — Unauthorized

## GET `/v2/getJsonSectors/{bikeparkID}`

**Sectoren voor stalling (operator)**

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |

### Responses

**200** — Array van sectoren

`application/json`

array van:
  `object`

**401** — Unauthorized

## GET `/v2/getJsonBikes/{bikeparkID}`

**Fietsen in stalling (operator)**

V2. Op v4:
`GET /api/fms/v4/citycodes/{citycode}/locations/{locationid}/bikes`.

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |

### Responses

**200** — Array van fietsen

`application/json`

array van:
  `object`

**401** — Unauthorized

## GET `/v2/getJsonBikeUpdates/{bikeparkID}`

**Fietsmutaties sinds tijdstip (operator)**

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `fromDate` | query | ja | string (date-time) |  |

### Responses

**200** — Mutaties

`application/json`

`object`

**401** — Unauthorized

## GET `/v2/getJsonSubscriptors/{bikeparkID}`

**Abonnementhouders in stalling (operator)**

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |

### Responses

**200** — Array van abonnementhouders

`application/json`

array van:
  `object`

**401** — Unauthorized

## GET `/v2/getLockerInfo/{bikeparkID}/{sectionID}/{placeID}`

**Fietskluis-info (operator)**

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `placeID` | path | ja | string |  |

### Responses

**200** — Kluisstatus

`application/json`

`object`

**401** — Unauthorized

## GET `/v2/isAllowedToUse/{bikeparkID}/{sectionID}/{placeID}`

**Mag sleutelhanger deze kluis gebruiken (operator)**

Tags: V2 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `placeID` | path | ja | string |  |
| `rfid` | query | ja | string | passID / sleutelhanger-ID |

### Responses

**200** — Toegangscontrole

`application/json`

`object`

**401** — Unauthorized

## POST `/v2/saveJsonBike/{bikeparkID}`

**Fiets/pas registreren**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `target` | query | nee | string (new) | Optioneel — schrijf naar shadow new_wachtrij_* tabellen |

### Request body

Verplicht.

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `barcode` | string | ja |  |
| `passID` | string | ja |  |
| `biketypeID` | integer | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/saveJsonBikes/{bikeparkID}`

**Meerdere fietsen/passen registreren**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

array van:
  `object`

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/uploadJsonTransaction/{bikeparkID}/{sectionID}`

**Check-in/out transactie**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `type` | string (in \\| out) | nee |  |
| `passID` | string | nee |  |
| `transactionDate` | string (date-time) | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/uploadJsonTransactions/{bikeparkID}/{sectionID}`

**Meerdere transacties**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

array van:
  `object`

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/addJsonSaldo/{bikeparkID}`

**Saldo opwaarderen**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `passID` | string | nee |  |
| `amount` | number | nee |  |
| `paymentTypeID` | integer | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/addJsonSaldos/{bikeparkID}`

**Meerdere saldo-opwaarderingen**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

array van:
  `object`

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/syncSector/{bikeparkID}/{sectionID}`

**Sector synchroniseren**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `target` | query | nee | string (new) |  |

### Request body

`application/json`

`object`

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/reportOccupationData/{bikeparkID}/{sectionID}`

**Bezettingsdata doorgeven**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `occupation` | integer | nee |  |
| `timestamp` | string (date-time) | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/addSubscription/{bikeparkID}`

**Abonnement verkopen**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscriptiontypeID` | integer | nee |  |
| `passID` | string | nee |  |
| `amount` | number | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/subscribe/{bikeparkID}`

**Sleutelhanger koppelen aan abonnement**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscriptionID` | integer | ja |  |
| `passID` | string | ja |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## PUT `/v2/updateLocker/{bikeparkID}/{sectionID}/{placeID}`

**Fietskluisstatus wijzigen (PUT)**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `placeID` | path | ja | string |  |

### Request body

`application/json`

`object`

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/updateLocker/{bikeparkID}/{sectionID}/{placeID}`

**Fietskluisstatus wijzigen**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `placeID` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `statuscode` | integer | nee |  |
| `transactionDate` | string (date-time) | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## PUT `/v2/setUrlWebserviceForLocker/{bikeparkID}/{sectionID}/{placeID}`

**Callback-URL voor fietskluis instellen (PUT)**

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string |  |
| `placeID` | path | ja | integer |  |

### Request body

Verplicht.

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `url` | string | ja |  |

### Responses

**200** — Resultaat

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v2/setUrlWebserviceForLocker/{bikeparkID}/{sectionID}/{placeID}`

**Callback-URL voor fietskluis instellen**

Zet urlwebservice op een kluisplek. Vereist dat ENABLE_WRITE_API aanstaat en operator Basic Auth.

Tags: V2 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `bikeparkID` | path | ja | string |  |
| `sectionID` | path | ja | string | externalId van de sector |
| `placeID` | path | ja | integer | Numeriek plek-ID (fietsenstalling_plek.id) |

### Request body

Verplicht.

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `url` | string (uri) | ja | Callback-URL die de kluis moet aanroepen bij wijzigingen |

`application/x-www-form-urlencoded`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `url` | string | ja |  |

### Responses

**200** — Resultaat

`application/json`

`Result` (zie [Schemas](#schemas))

**400** — url, bikeparkID, sectionID of placeID ontbreekt

**401** — Unauthorized of schrijven niet toegestaan

**405** — Alleen POST of PUT

## GET `/v3/servertime`

**Server tijd (algemene catalogus)**

V3. Op v4: `GET /api/fms/v4/servertime`.

Tags: V3

Auth: openbaar (geen auth)

### Responses

**200** — ISO 8601 timestamp

`application/json`

`string (date-time)` — date-time

## GET `/v3/biketypes`

**Alle fietstypen (algemene catalogus)**

V3 (`id`, `name`, `singular`). Op v4: `GET /api/fms/v4/biketypes`.

Tags: V3

Auth: openbaar (geen auth)

### Responses

**200** — Array van fietstypen (id, name, singular)

`application/json`

array van:
  object

  | Veld | Type | Verplicht | Beschrijving |
  | --- | --- | --- | --- |
  | `id` | integer | nee |  |
  | `name` | string | nee |  |
  | `singular` | string | nee |  |

## GET `/v3/paymenttypes`

**Betalingstypen (algemene catalogus)**

V3. Op v4: `GET /api/fms/v4/paymenttypes`.

Tags: V3

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

## GET `/v3/citycodes`

**Lijst van citycodes (gemeenten)**

Tags: V3

Auth: openbaar (geen auth)

### Responses

**200** — Array van citycodes

`application/json`

array van:
  `CityCode` (zie [Schemas](#schemas))

## GET `/v3/citycodes/{citycode}`

**Gemeente met locaties**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}`

**Eén locatie**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/sections`

**Sectoren op locatie**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}`

**Eén sector**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/subscriptiontypes`

**Abonnementsvormen op locatie**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}/balance`

**Saldo voor één ID-middel (operator)**

Tags: V3 Protected

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/balances`

**Saldi in gemeente (operator)**

Tags: V3 Protected

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/subscriptions`

**Abonnementen op locatie (operator)**

Tags: V3 Protected

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

## POST `/v3/citycodes/{citycode}/locations/{locationid}/subscriptions`

**Abonnement toevoegen (operator)**

Vereist dat ENABLE_WRITE_API aanstaat, naast Basic Auth met operator-permit.

Tags: V3 Write

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/bikeupdates`

**Fietsmutaties sinds tijdstip**

Tags: V3 Protected

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

## POST `/v3/citycodes/{citycode}/locations/{locationid}/completedtransactions`

**Afgeronde transactie (bikepark-niveau)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `completedtransaction` | V3CompletedTransaction | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/managedtransactions`

**Beheerde transactie(s) (bikepark-niveau)**

Enkel record via `managedtransaction`, een los object met `externaltransactionid`,
of batch via `managedtransactions` (array, max 50).
Bij dubbele `externaltransactionid` in één request wint het **laatste** item; alle items worden
eerst gevalideerd (all-or-nothing) voordat iets in de wachtrij komt.

Tags: V3 Write

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
- Optie 4:
  `V3ManagedTransaction` (zie [Schemas](#schemas))

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/idcodes/{idtype}/{idcode}`

**Tijdelijke pas koppelen aan definitieve pas (koppelpas)**

Tags: V3 Write

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

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/transactions`

**Stallingstransactie (sector)**

Tags: V3 Write

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
| `transaction` | V3Transaction | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/completedtransactions`

**Afgeronde transactie (sector)**

Tags: V3 Write

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
| `completedtransaction` | V3CompletedTransaction | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/managedtransactions`

**Beheerde transactie(s) (sector)**

Zelfde contract als bikepark-niveau `managedtransactions`. Default `sectionid` = sector uit URL;
per item overschrijfbaar via `sectionid` / `sectionid_checkin` in het payload.

Tags: V3 Write

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
- Optie 4:
  `V3ManagedTransaction` (zie [Schemas](#schemas))

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/occupation`

**Sector synchroniseren en/of bezetting doorgeven**

Tags: V3 Write

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Eén plek**

Tags: V3

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

## PUT `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Plek bijwerken (url, status, credentials)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `properties` | V3PlaceProperties | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}`

**Plek-log (updatePost)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `properties` | V3LogProperties | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/logs`

**Plek-log schrijven (fietskluizen)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `properties` | V3LogProperties | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/actions`

**Plek-actie schrijven (fietskluizen)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `properties` | V3LogProperties | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/transactions`

**Stallingstransactie (plek)**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `transaction` | V3Transaction | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## POST `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/subscriptions`

**Abonnement op plek**

Tags: V3 Write

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |

### Request body

`application/json`

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `subscription` | V3SubscriptionWrite | nee |  |

### Responses

**200**

`application/json`

`Result` (zie [Schemas](#schemas))

## GET `/v3/citycodes/{citycode}/locations`

**Locaties in gemeente**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locationscsv`

**Locaties in gemeente als CSV-regels**

Geeft per locatie één regel met de enkelvoudige veldwaarden (depth=1), gescheiden door ";".
Object- en array-velden worden overgeslagen.

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places`

**Plekken in sector**

Tags: V3

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

## GET `/v3/citycodes/{citycode}/locations/{locationid}/sections/{sectionid}/places/{placeid}/idcodes/{idtype}/{idcode}`

**Mag ID-middel deze plek gebruiken (operator)**

Controleert of een ID-middel (idcode/idtype) de gegeven plek mag gebruiken.
Vereist operator Basic Auth.

Tags: V3 Protected

Auth: basicAuth

### Parameters

| Naam | In | Verplicht | Type | Beschrijving |
| --- | --- | --- | --- | --- |
| `citycode` | path | ja | string |  |
| `locationid` | path | ja | string |  |
| `sectionid` | path | ja | string |  |
| `placeid` | path | ja | string |  |
| `idtype` | path | ja | integer | 0=sleutelhanger, 1=ovchip, 2=cijfercode, 3=tijdelijk |
| `idcode` | path | ja | string |  |

### Responses

**200** — Resultaat van de toegangscontrole

`application/json`

`V3IsAllowedToUse` (zie [Schemas](#schemas))

**401** — Unauthorized of onvoldoende rechten

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

Abonnementsvorm zoals in v2 `getJsonSubscriptionTypes`

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

### V3Transaction

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `idcode` | string | ja |  |
| `idtype` | integer | nee |  |
| `transactiondate` | string (date-time) | ja |  |
| `type` | string (in \\| out) | ja |  |
| `typecheck` | string | nee |  |
| `bikeid` | string | nee |  |
| `price` | number | nee |  |
| `paymenttypeid` | integer | nee |  |
| `clienttypeid` | integer | nee |  |

### V3CompletedTransaction

object

| Veld | Type | Verplicht | Beschrijving |
| --- | --- | --- | --- |
| `checkindate` | string (date-time) | nee |  |
| `checkoutdate` | string (date-time) | nee |  |
| `checkintype` | string | nee |  |
| `typecheckout` | string | nee |  |
| `price` | number | nee |  |
| `clienttypeid` | integer | nee |  |
| `biketypeid` | integer | nee |  |

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
