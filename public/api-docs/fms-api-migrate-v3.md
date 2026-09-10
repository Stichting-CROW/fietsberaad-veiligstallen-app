# FMS migratie V3 → V4

**Versie:** 4.0.0

Gegenereerd op 10 september 2026, 13:30 CEST uit `src/lib/openapi/fms-api-migrate-v3.json`.
Interactieve referentie: /test/fms-api-docs-migrate-v3

Migratiepad van **FMS V3** (`/rest/v3/...`) naar **V4** (`/api/fms/v4/...`).

Het V4-contract is het V3-contract: dezelfde JSON, andere prefix.
Vervang `/rest/v3` door `/api/fms/v4`. Resource-paden blijven gelijk.

- [V4 API-referentie](/docs/api/v4)
- [Migratie V2 → V4](/test/fms-api-docs-migrate-v2)
- [V2 + V3](/test/fms-api-docs)

## Host en pad

| | V3 | V4 |
| --- | --- | --- |
| Prefix | `/rest/v3/…` | `/api/fms/v4/…` |
| Auth | HTTP Basic + `permit` | hetzelfde |
| Query | `depth`, `fields` op catalogus-reads | hetzelfde |

**Catalogus** is naslagdata (geen mutaties). Twee groepen:

- **Algemene catalogus** — keuzelijsten voor de hele dienst (servertijd,
  fietstypen, betalingstypen).
- **Stallingscatalogus** — gemeenten, locaties, secties, plekken,
  abonnementsvormen (`citycodes` / `locations` / …).

## Algemene catalogus

| V3 | V4 |
| --- | --- |
| `GET /rest/v3/servertime` | `GET /api/fms/v4/servertime` |
| `GET /rest/v3/biketypes` | `GET /api/fms/v4/biketypes` |
| `GET /rest/v3/paymenttypes` | `GET /api/fms/v4/paymenttypes` |

## Stallingscatalogus (1:1)

| V3 | V4 |
| --- | --- |
| `GET /rest/v3/citycodes` | `GET /api/fms/v4/citycodes` |
| `GET /rest/v3/citycodes/{citycode}` | `GET /api/fms/v4/citycodes/{citycode}` |
| `GET …/locations` | `GET …/locations` |
| `GET …/locationscsv` | `GET …/locationscsv` |
| `GET …/locations/{locationid}` | zelfde pad onder `/api/fms/v4` |
| `GET …/sections`, `…/sections/{sectionid}` | zelfde |
| `GET …/places`, `…/places/{placeid}` | zelfde |
| `GET …/subscriptiontypes` | zelfde |
| `GET …/balances` | zelfde (operator) |
| `GET …/idcodes/{idtype}/{idcode}/balance` | zelfde (operator) |
| `GET …/subscriptions` | zelfde (operator) |
| `GET …/bikeupdates?from=` | zelfde (`from`, operator / type1) |
| `GET …/places/{placeid}/idcodes/{idtype}/{idcode}` | **410** — `isAllowedToUse` |

## Writes die blijven

| V3 | V4 |
| --- | --- |
| `POST …/managedtransactions` | zelfde pad onder `/api/fms/v4` |
| `POST …/sections/{sectionid}/occupation` | zelfde (`data.occupation` en/of `data.bikes`) |
| `POST …/subscriptions` | addSubscription |
| `POST …/subscriptions/{subscriptionid}` | subscribe (pas koppelen) |
| `POST …/idcodes/{idtype}/{idcode}` | koppelpas |
| `POST …/idcodes/{idtype}/{idcode}/balance` | saldo |
| `POST …/idcodes/{idtype}/{idcode}/bike` | fiets registreren |

## Writes die 410 geven (niet overzetten)

Deze calls geven HTTP 410 in v4. Niet opnieuw implementeren.

| V3 | V4 |
| --- | --- |
| `POST …/transactions` (In/Uit) | **410** — gebruik `managedtransactions` |
| `POST …/completedtransactions` | **410** — gebruik `managedtransactions` |
| `PUT`/`POST …/places/{placeid}` | **410** — fietskluizen uitgefaseerd |
| `POST …/places/{placeid}/logs` | **410** |
| `POST …/places/{placeid}/actions` | **410** |
| `POST …/places/{placeid}/subscriptions` | **410** |
| `GET`/`POST …/places/{placeid}/idcodes/…` | **410** — `isAllowedToUse` / place koppelpas |

Plek-**reads** (`GET …/places`, `GET …/places/{id}`) blijven. `isAllowedToUse` is 410.

## Nieuw in V4 (niet in V3)

| V4 | Toelichting |
| --- | --- |
| `GET /api/fms/v4/clienttypes` | algemene catalogus: klanttypen (was alleen V2) |
| `GET …/locations/{locationid}/bikes` | barcoderegister (was alleen V2 `getJsonBikes`) |

## Eén stalling, één versie

Gebruik voor één stalling óf v3 óf v4, niet beide. Anders kunnen
transacties en bezettingsdata dubbel binnenkomen.

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
