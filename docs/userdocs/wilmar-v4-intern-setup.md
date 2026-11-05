# Deel 1 — Interne setup (niet naar Wilmar sturen)

Handleiding om een testomgeving klaar te zetten zodat Wilmar v4 kan testen zonder productie-stallingen aan te raken.

Vereist: fietsberaad-superadmin, `acceptatie_ontwikkeling`, `TEST_ENV_BOOTSTRAP=1`, en `ENABLE_WRITE_API=true` op de host (anders geven writes HTTP 403).

Aanbevolen: lokale **Acceptatie (docker)**-stack (`acc_docker` op `127.0.0.1:5556`) met `npm run dev`. Zie [acceptance-docker.md](../acceptance-docker.md).

Na afronding: stuur [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) naar Wilmar. Pas daarin de basis-URL aan (`http://localhost:3000` of je tunnel).

---

## 1. Testgemeente

1. **Beheer → Ontwikkeling → Acceptatie (docker)** → tab **Test data-eigenaar**.
2. Klik **Test data-eigenaar aanmaken** (beheerlogin + data-eigenaar testgemeente API, citycode `9933`).

Dat maakt o.a. aan:

- Data-eigenaar `testgemeente API` (citycode `9933`) met standaardstallings zoals **`9933_001`**
- Test-exploitant **Test exploitant API**
- Test-dataleverancier **Test dataleverancier API** (`api-test` / `api-test-$$`) met FMS operator-rechten op alle stallingen
- Beheeraccounts `beheerder@testgemeente.test` en `exploitant@testgemeente.test` (wachtwoord `teststalling`)

De inloggegevens staan in de tabel **Testaccounts** op hetzelfde tabblad.

Extra layout-kloon: **Stalling klonen** → type *bewaakt* → bron *Utrecht* → *Vredenburg* → **Aanmaken**.

### NS koppeling (optioneel)

1. Zet `NSCONNECTOR_SUBSCRIPTION_KEY` in `.env` / `.env.local`.
2. Tab **NS koppeling** → **NS data-eigenaar bootstrap** (organisatie `ns` + exploitant `ns-stations`).
3. **Beheer → Achtergrondprocessen → NS Koppeling** → voorbeeld-import of echte import (zelfde sync als productie).

## 2. Smoke-test

Met de app op je dev-host:

```bash
curl -sS -u 'api-test:api-test-$$' \
  'http://localhost:3000/api/fms/v4/citycodes/9933/locations/9933_001'
```

Verwacht: JSON van de stalling, geen 401.

Transacties en bezetting test je via de FMS v4 API of [FMS schrijf-tests](/test/fms-write-tests) (superadmin).

## 3. Checklist voor Wilmar

Geef hen [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) plus:

| Gegeven | Waarde |
| --- | --- |
| Host | jouw Next.js-basis-URL (bijv. tunnel naar localhost) |
| User / wachtwoord | `api-test` / `api-test-$$` |
| Citycode | `9933` |
| Locationid | `9933_001` |
| Sectionid | `9933_001_1` |

Deze stalling is **alleen v4** op de Next.js-host. Niet ook v2/v3 op ColdFusion aanroepen voor dezelfde stalling.
