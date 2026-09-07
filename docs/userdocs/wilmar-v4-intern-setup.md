# Deel 1 — Interne setup (niet naar Wilmar sturen)

Handleiding om een testomgeving klaar te zetten zodat Wilmar v4 kan testen zonder productie-stallingen aan te raken.

Vereist: fietsberaad-superadmin, en `ENABLE_WRITE_API=true` op de host (anders geven writes HTTP 403).

Aanbevolen host: **acceptance** (`https://vstfb-eu-acc-app01.azurewebsites.net`).

Na afronding: stuur [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) naar Wilmar. Pas daarin de basis-URL aan als je een andere host gebruikt.

---

## 1. Tabellen en testgemeente

1. Open `/beheer/parking-simulation` → tab **Instellingen**.
2. **Parkeer Simulatie tabellen**: als status *Niet aanwezig* is, klik **Maak tabellen**.
3. **Testgemeente API**: als status *Niet aanwezig* is, klik **Maak testgemeente**.

Dat maakt de organisatie `testgemeente API` (citycode `9933`) aan, inclusief een kopie van Utrecht Vredenburg als stalling **`9933_001`** (sectie **`9933_001_1`**).

Een extra kloon is niet nodig. Wil je toch een verse kopie: **Teststallingen → Toevoegen** → type *bewaakt* → bron *Utrecht* → zoek *Vredenburg* → **Aanmaken**. Noteer het nieuwe StallingsID (`9933_00x`).

## 2. API-account

1. **Beheer → Organisaties → Dataleveranciers → Nieuwe Dataleverancier**
   - Naam: `Wilmar API test`
   - ContractorID (datastandaard): `api-test`
   - Wachtwoord: `api-test-$$`
   - Status: Actief
2. **Beheer → Organisaties → Data-eigenaren** → open **testgemeente API** → tab **FMS rechten**
   - Dataleverancier: *Wilmar API test*
   - Locatie: *Alle stallingen in testgemeente API*
   - Rechten: **Operator (alle rechten)**
   - **Toegang toevoegen**

## 3. Simulatie-credentials en fietsen

Op dezelfde pagina `/beheer/parking-simulation` → **Instellingen** → **FMS API instellingen**:

- UrlName: `api-test`
- Wachtwoord: `api-test-$$`
- API Base URL: leeg laten
- **Opslaan**

Daarna tab **Dashboard**:

1. Fietsenpool → **Vullen** (50 fietsen, 30 elektrisch, 10 bromfietsen, 10 bakfietsen).
2. Open het tabblad van stalling `9933_001`.
3. Onder **Report transactions**: Type *In*, kies een fietstype, klik **Check-in** (eventueel aantal 5).
4. Klik **Process** zodat de transacties in `transacties` landen.

Optionele smoke-test (ingelogd in dezelfde browser):

```bash
curl -sS -u 'api-test:api-test-$$' \
  'https://vstfb-eu-acc-app01.azurewebsites.net/api/fms/v4/citycodes/9933/locations/9933_001'
```

Verwacht: JSON van de stalling, geen 401.

## 4. Checklist voor Wilmar

Geef hen [wilmar-v4-api-handleiding.md](wilmar-v4-api-handleiding.md) plus:

| Gegeven | Waarde |
| --- | --- |
| Host | `https://vstfb-eu-acc-app01.azurewebsites.net` |
| User / wachtwoord | `api-test` / `api-test-$$` |
| Citycode | `9933` |
| Locationid | `9933_001` |
| Sectionid | `9933_001_1` |

Deze stalling is **alleen v4** op de Next.js-host. Niet ook v2/v3 op ColdFusion aanroepen voor dezelfde stalling.
