# FMS migratie V2 → V4

**Versie:** 4.0.0

Gegenereerd op 10 september 2026, 13:30 CEST uit `src/lib/openapi/fms-api-migrate-v2.json`.
Interactieve referentie: /test/fms-api-docs-migrate-v2

Migratiepad van **FMS V2** (`/REST/v1/...`, `/v2/REST/...`) naar
**V4** (`/api/fms/v4/...`).

V4 gebruikt kleine letters en resource-URL's, niet de V2
hoofdletter-keys (`BIKETYPEID`, `NAME`, …).

- [V4 API-referentie](/docs/api/v4)
- [Migratie V3 → V4](/test/fms-api-docs-migrate-v3)
- [V2 + V3](/test/fms-api-docs)

## Host en pad

| | V2 | V4 |
| --- | --- | --- |
| Catalogus (algemeen) | `/REST/v1/getBikeTypes` e.d. | `/api/fms/v4/biketypes` e.d. |
| Stallingscatalogus | `/v2/REST/getJson…/{bikeparkID}` | `/api/fms/v4/citycodes/{citycode}/locations/{locationid}/…` |
| Auth | HTTP Basic, `permit` per stalling | hetzelfde |

**Algemene catalogus** = keuzelijsten voor de hele dienst (fietstypen,
betalingstypen, klanttypen, servertijd). **Stallingscatalogus** = gemeenten,
locaties, secties, plekken, abonnementsvormen.

`citycode` is de postcode/ZipID van de stalling (bijv. `9933` voor `9933_001`).

## Reads

| V2 | V4 | Contract |
| --- | --- | --- |
| `GET /REST/v1/getServerTime` of `/v2/getServerTime` | `GET /api/fms/v4/servertime` | ISO-achtige timestamp (niet de v2 locale-string) |
| `GET /REST/v1/getBikeTypes` of `/v2/getJsonBikeTypes` | `GET /api/fms/v4/biketypes` | `{id, name, singular}` i.p.v. `{BIKETYPEID, NAME}` |
| `GET /v2/getJsonBikeType/{id}` | `GET /api/fms/v4/biketypes` | filter op `id` (geen aparte single-id route) |
| `GET /REST/v1/getPaymentTypes` of `/v2/getJsonPaymentTypes` | `GET /api/fms/v4/paymenttypes` | `{paymenttypeid, name, description}` i.p.v. hoofdletter-keys |
| `GET /REST/v1/getClientTypes` of `/v2/getJsonClientTypes` | `GET /api/fms/v4/clienttypes` | `{id, name}` i.p.v. `{CLIENTTYPEID, NAME}` |
| `GET /v2/REST/getJsonSubscriptionTypes/{bikeparkID}` | `GET /api/fms/v4/citycodes/{citycode}/locations/{locationid}/subscriptiontypes` | V3-vorm (niet V2 `SubscriptionType`) |
| `GET /v2/REST/getJsonSectors/{bikeparkID}` | `GET …/locations/{locationid}/sections` | V3-secties, niet V2-sectorobject |
| `GET /v2/REST/getJsonBikes/{bikeparkID}` | `GET …/locations/{locationid}/bikes` | `{barcode, biketypeid}` (operator) |
| `GET /v2/REST/getJsonBikeUpdates/{bikeparkID}?fromDate=` | `GET …/locations/{locationid}/bikeupdates?from=` | query `from` i.p.v. `fromDate` |
| `GET /v2/REST/getJsonSubscriptors/{bikeparkID}` | `GET …/locations/{locationid}/subscriptions` | V3-vorm (operator) |
| `GET /v2/REST/getLockerInfo/{bikeparkID}/{sectionID}/{placeID}` | `GET …/sections/{sectionid}/places/{placeid}` | plek-read blijft; locker-writes zijn 410 |
| `GET /v2/isAllowedToUse/…` | **410** — niet in v4 |

## Writes

| V2 | V4 |
| --- | --- |
| `POST /v2/saveJsonBike(s)/{bikeparkID}` | `POST …/idcodes/{idtype}/{idcode}/bike` |
| `POST /v2/addJsonSaldo(s)/{bikeparkID}` | `POST …/idcodes/{idtype}/{idcode}/balance` |
| `POST /v2/addSubscription/{bikeparkID}` | `POST …/locations/{locationid}/subscriptions` |
| `POST /v2/subscribe/{bikeparkID}` | `POST …/locations/{locationid}/subscriptions/{subscriptionid}` |
| `POST /v2/reportOccupationData/…` | `POST …/sections/{sectionid}/occupation` (`data.occupation`) |
| `POST /v2/syncSector/…` | `POST …/sections/{sectionid}/occupation` (`data.bikes`) |
| `POST /v2/uploadJsonTransaction(s)/…` | **410** — gebruik `POST …/managedtransactions` |
| `POST`/`PUT` `updateLocker` | **410** — fietskluizen uitgefaseerd |
| `setUrlWebserviceForLocker` | **410** — fietskluizen uitgefaseerd |

Check-in/out op v4 is alleen **managedtransactions**. Bezetting is
**occupation**. Gebruik voor één stalling óf v2 óf v4, niet beide.

## Niet overzetten

In/uit (`uploadJsonTransaction`) en fietskluizen-aansturing zijn bewust
uitgefaseerd in v4 (HTTP 410).

## Servers

| URL | Beschrijving |
| --- | --- |
| `/api/fms` | FMS REST API v4 |

## Endpoints

- [GET /v4](#get-v4)

## GET `/v4`

**Try-it-out staat op de V4-referentie**

Deze pagina is alleen het migratiepad. Endpoints uitproberen:
[V4 API-referentie](/docs/api/v4).

Tags: Migratie

Auth: openbaar (geen auth)

### Responses

**200** — Zie /docs/api/v4
