# FMS API v4 — testhandleiding voor Wilmar

Deze omgeving is bedoeld om jullie app van FMS **v2/v3** (ColdFusion) naar **v4** (Next.js) te migreren. Alleen de teststalling hieronder gebruiken.

## Toegang

Basis-URL: `https://vstfb-eu-acc-app01.azurewebsites.net`  
Auth voor beide API's: HTTP Basic. De accounts zijn niet uitwisselbaar.

| | FMS API v4 | Reporting API v4 |
| --- | --- | --- |
| Gebruikersnaam | `api-test` | `api-test@testgemeente.text` |
| Wachtwoord | `skm*A&oc871*` | `Yavc1Gwo8dzW` |
| Swagger | [FMS API v4](https://vstfb-eu-acc-app01.azurewebsites.net/docs/api/v4) | [Reporting API v4](https://vstfb-eu-acc-app01.azurewebsites.net/docs/api/reporting/v4) |

| | |
| --- | --- |
| Citycode | `9933` |
| Locationid | `9933_001` |
| Sectionid | `9933_001_1` |

De voorbeelden hieronder gebruiken het FMS-account. Het reporting-account geldt alleen voor `/api/reporting/v4`.

Migratieoverzicht: `{basis-URL}/test/fms-api-docs-migrate-v2` en `…/fms-api-docs-migrate-v3`

## Wat verandert er

- **Andere host en prefix.** ColdFusion `https://remote.veiligstallen.nl` blijft voor bestaande stallingen. v4 staat op de Next.js-host onder `/api/fms/v4/…`.
- **Geen v2/v3 op Next.js.** Er is geen `/api/fms/v2` of `/api/fms/v3`.
- **v3 → v4 is 1:1.** Vervang `/rest/v3` door `/api/fms/v4`. JSON-contract blijft gelijk.
- **v2 → v4 volgt het v3-contract.** Kleine letters, resource-URL’s. Geen `BIKETYPEID` / `NAME` meer.
- **Check-in/out alleen via** `managedtransactions`**.** `POST …/transactions` en `…/completedtransactions` geven **410**.



## Padvertaling



### Catalogus


| Oud (v2 / v3)                                             | Nieuw (v4)                     |
| --------------------------------------------------------- | ------------------------------ |
| `GET /REST/v1/getServerTime` of `/rest/v3/servertime`     | `GET /api/fms/v4/servertime`   |
| `GET /REST/v1/getBikeTypes` of `/rest/v3/biketypes`       | `GET /api/fms/v4/biketypes`    |
| `GET /REST/v1/getPaymentTypes` of `/rest/v3/paymenttypes` | `GET /api/fms/v4/paymenttypes` |
| `GET /v2/getJsonClientTypes`                              | `GET /api/fms/v4/clienttypes`  |




### Stalling (citycode `9933`, location `9933_001`)


| Oud                                                          | Nieuw                                   |
| ------------------------------------------------------------ | --------------------------------------- |
| `GET /rest/v3/citycodes/{city}/locations/{id}`               | zelfde pad onder `/api/fms/v4`          |
| `GET …/sections`, `…/subscriptiontypes`                      | zelfde                                  |
| `GET /v2/REST/getJsonBikes/{id}`                             | `GET …/locations/{id}/bikes`            |
| `POST …/managedtransactions`                                 | zelfde pad onder `/api/fms/v4`          |
| `POST …/occupation`                                          | zelfde                                  |
| `POST …/idcodes/{idtype}/{idcode}/bike`                      | zelfde (fiets registreren)              |
| `POST …/idcodes/{idtype}/{idcode}/balance`                   | zelfde (saldo opwaarderen)              |
| `GET …/idcodes/{idtype}/{idcode}/balance`, `GET …/balances`  | zelfde (saldo lezen)                    |
| `POST …/idcodes/{idtype}/{idcode}` (koppelpas)               | zelfde; de sectie-variant `…/sections/{sec}/idcodes/…` werkt ook |
| `GET …/subscriptions`, `POST …/subscriptions/{id}`           | zelfde (lezen, pas koppelen)            |
| `GET …/bikeupdates`                                          | zelfde                                  |
| `POST /v2/uploadJsonTransaction(s)` of `POST …/transactions` | **410** — gebruik `managedtransactions` |
| `POST …/subscriptions` (abonnement verkopen)                 | **410** — alleen via de website         |




## Check-in / check-out

`POST /api/fms/v4/citycodes/9933/locations/9933_001/sections/9933_001_1/managedtransactions`

Ook zonder sectie in de URL: `POST …/locations/9933_001/managedtransactions` (sectie dan in het payload).

Enkel record: `{ "managedtransaction": { … } }`  
Batch: `{ "managedtransactions": [ … ] }` (max 500). Eerst worden alle items gecontroleerd; is er één fout, dan gaat niets de wachtrij in. Komt hetzelfde `externaltransactionid` twee keer voor in één batch, dan telt het laatste item.

Verplicht: `externaltransactionid` (max 100 tekens), `idcode`, `checkindate`.  
`checkintype` en `checkouttype`: `user`, `controle`, `system`, `sync` of `reservation`. Standaard `user`.

Bij check-out (`checkoutdate` gevuld):

- `checkoutdate` mag niet vóór `checkindate` liggen.
- Zonder `stallingsduur` rekent de API de minuten tussen check-in en check-out uit.
- Zonder `stallingskosten` wordt het `0`.

Zelfde `externaltransactionid` bij check-out = update van dezelfde transactie. Een correctie met dat id moet binnen 18 maanden na de check-out binnen zijn. Daarna is de transactie opgeruimd en telt hetzelfde id als een nieuw bezoek.

### Voorbeelden

De voorbeelden gebruiken deze shell-variabelen:

```bash
V4='https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4'
LOC="$V4/citycodes/9933/locations/9933_001"
```

Check-in:

```bash
curl -sS -u 'api-test:skm*A&oc871*' \
  -H 'Content-Type: application/json' \
  -X POST \
  "$LOC/sections/9933_001_1/managedtransactions" \
  -d '{
    "managedtransaction": {
      "externaltransactionid": "WILMAR-TEST-001",
      "idcode": "PASS-001",
      "idtype": 0,
      "checkindate": "2026-08-24T10:00:00",
      "checkintype": "user",
      "bikeid_in": "SIM-BIKE-001",
      "biketypeid": 1,
      "sectionid": "9933_001_1"
    }
  }'
```

Check-out (zelfde `externaltransactionid`):

```bash
curl -sS -u 'api-test:skm*A&oc871*' \
  -H 'Content-Type: application/json' \
  -X POST \
  "$LOC/sections/9933_001_1/managedtransactions" \
  -d '{
    "managedtransaction": {
      "externaltransactionid": "WILMAR-TEST-001",
      "idcode": "PASS-001",
      "idtype": 0,
      "checkindate": "2026-08-24T10:00:00",
      "checkintype": "user",
      "checkoutdate": "2026-08-24T12:30:00",
      "checkouttype": "user",
      "bikeid_out": "SIM-BIKE-001",
      "biketypeid": 1,
      "stallingsduur": 150,
      "stallingskosten": 0,
      "sectionid": "9933_001_1"
    }
  }'
```

Succes: `{ "message": "OK", "status": 1, "id": … }`. Bij een batch: `"ids": [ … ]`, in dezelfde volgorde.  
Writes gaan eerst in een wachtrij en worden kort daarna verwerkt. Even wachten voordat je het resultaat terugleest.

## Bezetting en sectorcontrole

`POST …/sections/9933_001_1/occupation` met `{ "data": { … } }`. `data.bikes` of `data.occupation` is verplicht. Alleen `data.managedtransactions` geeft 400.

- `data.bikes` — lijst van fietsen die bij een controle in de sectie stonden. Wordt opgeslagen als controlemoment en maakt zelf geen transacties.
- `data.managedtransactions` — afwijkingen bij die controle (max 2500). Alleen samen met `data.bikes` en/of `data.occupation`.
- `data.occupation` — het bezettingsgetal voor het scherm. Wordt opgeslagen met je inlognaam als bron. Staat de bron bezettingsdata van de stalling op `FMS`, dan houdt VeiligStallen de bezetting ook zelf bij uit de managed transacties: +1 bij een nieuw open bezoek, −1 bij het afsluiten, ook bij `controle` en `sync`. Een meegestuurd bezettingsgetal overschrijft die telling.

## Rechten

Het FMS-account `api-test` heeft **operator**-rechten op alle stallingen van citycode `9933`.

| Permit               | Mag                                                               |
| -------------------- | ----------------------------------------------------------------- |
| `operator` | alles |
| `dataprovider.type1` | `managedtransactions`, `occupation` met `data.bikes`, `bikeupdates` lezen |
| `dataprovider.type2` | `managedtransactions`, `occupation` (ook het bezettingsgetal), abonnementen, saldo opwaarderen, fiets koppelen |

Koppelpas en de gevoelige reads (saldi, abonnementen, `bikes`) vereisen `operator`. Openbare catalogus-reads (steden, locaties, secties, plekken) werken zonder auth.

## Foutcodes

Fouten hebben de vorm `{ "message": "…", "status": 0 }`.

| HTTP | Betekenis                                                                    |
| ---- | ---------------------------------------------------------------------------- |
| 400 | Ongeldige invoer, bijvoorbeeld een ontbrekend verplicht veld of een batch van meer dan 500. `message` zegt wat er mis is. |
| 401 | Geen of verkeerde Basic Auth, of het account heeft niet het vereiste permit (`Niet voldoende rechten`). |
| 403 | De write-API staat uit op deze host. |
| 404 | Onbekend pad, of bij lezen: stad, stalling, sectie of plek niet gevonden. |
| 410 | Endpoint bestaat niet meer in v4 (zie hieronder). |

## Wat niet in v4 zit (410)

Blijft op ColdFusion v2/v3, niet opnieuw bouwen:

- `POST …/transactions` (legacy in/uit)
- `POST …/completedtransactions`
- kluis-writes (`PUT`/`POST …/places/{id}`, `/logs`, `/actions`)
- `GET`/`POST …/places/{id}/idcodes/…` (`isAllowedToUse` / koppelpas op plek)

Plek-**reads** (`GET …/places`) blijven.

## Eerste checks

```bash
V4='https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4'

# openbaar
curl -sS "$V4/servertime"
curl -sS "$V4/citycodes/9933"

# met auth
curl -sS -u 'api-test:skm*A&oc871*' "$V4/citycodes/9933/locations/9933_001"
```

`&` en `*` in het wachtwoord: gebruik enkele quotes (`'api-test:skm*A&oc871*'`). Zonder quotes ziet de shell `&` als achtergrond en `*` als wildcard.