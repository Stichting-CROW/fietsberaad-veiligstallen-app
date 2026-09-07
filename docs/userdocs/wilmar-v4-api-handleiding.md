# FMS API v4 — testhandleiding voor Wilmar

Deze omgeving is bedoeld om jullie app van FMS **v2/v3** (ColdFusion) naar **v4** (Next.js) te migreren. Alleen de teststalling hieronder gebruiken.

## Toegang


|                |                                                |
| -------------- | ---------------------------------------------- |
| Basis-URL      | `https://vstfb-eu-acc-app01.azurewebsites.net` |
| Auth           | HTTP Basic                                     |
| Gebruikersnaam | `api-test`                                     |
| Wachtwoord     | `api-test-$$`                                  |
| Citycode       | `9933`                                         |
| Locationid     | `9933_001`                                     |
| Sectionid      | `9933_001_1`                                   |


Interactieve referentie: `{basis-URL}/test/fms-api-docs-v4`  
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
| `POST …/idcodes/{idtype}/{idcode}/balance`                   | zelfde (saldo)                          |
| `POST /v2/uploadJsonTransaction(s)` of `POST …/transactions` | **410** — gebruik `managedtransactions` |




## Check-in / check-out

`POST /api/fms/v4/citycodes/9933/locations/9933_001/sections/9933_001_1/managedtransactions`

Ook zonder sectie in de URL: `POST …/locations/9933_001/managedtransactions` (sectie dan in het payload).

Enkel record: `{ "managedtransaction": { … } }`  
Batch: `{ "managedtransactions": [ … ] }` (max 50, all-or-nothing).

Verplicht: `externaltransactionid`, `idcode`, `checkindate`, `checkintype` (`user`  `controle`  `system`  `sync`  `reservation`).

Zelfde `externaltransactionid` bij check-out = update van dezelfde transactie.

### Voorbeelden

Check-in:

```bash
curl -sS -u 'api-test:api-test-$$' \
  -H 'Content-Type: application/json' \
  -X POST \
  'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/citycodes/9933/locations/9933_001/sections/9933_001_1/managedtransactions' \
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
curl -sS -u 'api-test:api-test-$$' \
  -H 'Content-Type: application/json' \
  -X POST \
  'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/citycodes/9933/locations/9933_001/sections/9933_001_1/managedtransactions' \
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

Succes: `{ "status": 1, "message": "Ok", "id": … }`.  
Writes gaan eerst in een wachtrij en worden kort daarna verwerkt. Even wachten voordat je het resultaat terugleest.

## Rechten

Het testaccount heeft **operator**-rechten op alle stallingen van citycode `9933`.

- `operator` — lezen en schrijven
- `dataprovider.type2` — `managedtransactions` + bezetting
- `dataprovider.type1` — alleen inventarisatie (`occupation` met `data.bikes`)

Openbare catalogus-reads (steden, locaties, secties) werken zonder auth. Gevoelige reads (saldi, abonnementen, bikes) vereisen Basic Auth.

## Wat niet in v4 zit (410)

Blijft op ColdFusion v2/v3, niet opnieuw bouwen:

- `POST …/transactions` (legacy in/uit)
- `POST …/completedtransactions`
- kluis-writes (`PUT`/`POST …/places/{id}`, `/logs`, `/actions`)
- `GET`/`POST …/places/{id}/idcodes/…` (`isAllowedToUse` / koppelpas op plek)

Plek-**reads** (`GET …/places`) blijven.

## Eerste checks

```bash
# openbaar
curl -sS 'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/servertime'
curl -sS 'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/citycodes/9933'

# met auth
curl -sS -u 'api-test:api-test-$$' \
  'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/citycodes/9933/locations/9933_001'
```

`$` in het wachtwoord: gebruik enkele quotes (`'api-test:api-test-$$'`), anders eet de shell de `$$` op.