# Deel 1 — Interne setup (niet naar Wilmar sturen)

Handleiding om Azure-acceptatie klaar te zetten zodat Wilmar v4 kan testen zonder productie-stallingen aan te raken.

Na afronding: stuur [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) (of de PDF) naar Wilmar.

## 0. Voorwaarden op acceptatie

Host: `https://vstfb-eu-acc-app01.azurewebsites.net`. De acceptance-workflow (`.github/workflows/azure-webapps-node-acceptance.yml`) zet:

| Variabele | Waarde | Waarom |
| --- | --- | --- |
| `ENABLE_WRITE_API` | `true` | Anders geven FMS-writes HTTP 403. |
| `BACKGROUND_INTERNAL_TICK` | `true` | Verwerkt de FMS-wachtrij elke minuut. Zonder deze vlag blijven managed transactions in de wachtrij staan. |
| `TEST_DATA_EIGENAAR_BOOTSTRAP` | `1` | Staat het aanmaken en verwijderen van de test data-eigenaar toe. Wist verder niets. Nooit in de production-workflow zetten. |

Je hebt een beheerlogin nodig met de rechten `fietsberaad_superadmin` en `acceptatie_ontwikkeling`.

## 1. Testgemeente aanmaken

1. **Beheer → Acceptatie (docker)** → tab **Test data-eigenaar**.
2. Klik **Test data-eigenaar aanmaken**.

Dat maakt aan:

- Data-eigenaar `testgemeente API` (citycode `9933`) met de stallingen `9933_001` tot en met `9933_007`
- Test-exploitant **Test exploitant API**
- Test-dataleverancier **Test dataleverancier API** (`api-test` / `api-test-$$`) met FMS-permit `operator` op alle stallingen van de testgemeente
- Beheeraccounts `beheerder@testgemeente.test` en `exploitant@testgemeente.test` (wachtwoord `teststalling`)

De inloggegevens staan ook in de tabel **Testaccounts** op hetzelfde tabblad.

Opnieuw beginnen: **Test data-eigenaar verwijderen** verwijdert alleen de testgemeente en de gekoppelde testaccounts.

## 2. Smoke-test

```bash
V4='https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4'
LOC="$V4/citycodes/9933/locations/9933_001"

# lezen met auth: JSON van de stalling, geen 401
curl -sS -u 'api-test:api-test-$$' "$LOC"

# check-in via de wachtrij: {"message":"OK","status":1,"id":…}
curl -sS -u 'api-test:api-test-$$' -H 'Content-Type: application/json' -X POST \
  "$LOC/sections/9933_001_1/managedtransactions" \
  -d '{"managedtransaction":{"externaltransactionid":"SMOKE-001","idcode":"SMOKE-PASS",
       "checkindate":"2026-11-06T10:00:00","checkintype":"user"}}'
```

Controleer daarna in **Beheer → Wachtrij** dat het item binnen een paar minuten verwerkt is. Blijft het staan, kijk dan of `BACKGROUND_INTERNAL_TICK` aan staat (**Beheer → Achtergrondprocessen**, taak *Wachtrij verwerken (FMS)*).

Meer scenario's: [FMS schrijf-tests](/test/fms-write-tests) (superadmin).

## 3. Checklist voor Wilmar

Geef hen [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) plus:

| Gegeven | Waarde |
| --- | --- |
| Host | `https://vstfb-eu-acc-app01.azurewebsites.net` |
| User / wachtwoord | `api-test` / `api-test-$$` |
| Citycode | `9933` |
| Locationid | `9933_001` |
| Sectionid | `9933_001_1` |

Deze stalling is **alleen v4** op de Next.js-host. Niet ook v2/v3 op ColdFusion aanroepen voor dezelfde stalling.

## Lokaal alternatief

Testen tegen de lokale **Acceptatie (docker)**-stack (`acc_docker` op `127.0.0.1:5556`) kan ook, met `TEST_ENV_BOOTSTRAP=1` en een tunnel naar `localhost:3000`. Zie [acceptance-docker.md](../acceptance-docker.md). Pas dan de basis-URL in de handleiding aan.

### NS koppeling (alleen lokaal)

1. Zet `NSCONNECTOR_SUBSCRIPTION_KEY` in `.env` / `.env.local`.
2. Tab **NS koppeling** → **NS data-eigenaar bootstrap** (organisatie `ns` + exploitant `ns-stations`).
3. **Beheer → Achtergrondprocessen → NS Koppeling** → voorbeeld-import of echte import (zelfde sync als productie).
