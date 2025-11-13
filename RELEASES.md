# App updates VeiligStallen

## VeiligStallen 2025-XX-XX

**Beheer**

- Verbeterd ontwerp voor het linkermenu
- Smallere organisatie-selector in topmenu

**Gebruikersbeheer**

- In gebruikersoverzicht: toon eerst de interne gebruikers (van eigen organisatie) en daarna de externe gebruikers

**Rapportages**

- Eenvoudiger wisselen van rapportage middels nieuw 'rapportage-menu' aan de linkerkant

## VeiligStallen 2025-11-06

**Stallingenbeheer**

- 🖌️ Logo gemeente in site-header staat nu verticaal gecentreerd
- 🐛 Fix: Foto van fietsenstalling kan weer worden opgeslagen

## VeiligStallen 2025-11-04

**Stallingsbeheer**

- Verbeterde UX voor beheren capaciteit:
  - toon capaciteit tijdens bewerken van secties
  - toon informatieve test als er nog geen secties zijn
  - bewerk secties in een dialoog, om te verduidelijken dat secties apart opgeslagen moeten worden

**Tariefcodes**

- ✨ Nieuw: beheer en zie tariefcodes per stalling
  - Configureer tariefcodes en -beschrijvingen in FMS en database (bekijken, toevoegen, bewerken, verwijderen)
  - Toon tariefcodes bij stalling

## VeiligStallen 2025-10-30 (tariefcodes-feature branch)

**Beheer / Database**

- ✨ Nieuw: Beheerscherm voor tariefcodes toegevoegd aan database-beheer
- ✨ Volledige CRUD-functionaliteit voor tariefcodes (aanmaken, bewerken, verwijderen)
- ✨ Seed-functionaliteit voor het initialiseren van tariefcodes
- ✨ Database cleanup tools voor orphaned sections en tarieven:
  - Tool voor het identificeren en opruimen van incorrecte/verweesde secties
  - Tool voor het identificeren en opruimen van incorrecte tarieven (sectie_fietstype entries)
- ✨ Validatie bij het aanmaken van stallingen om foutieve secties te voorkomen
- ✨ Database check scripts toegevoegd voor controle op database consistentie (orphaned sections en tarieven)

**Stalling-beheer**

- ✨ Velden voor tariefcodes toegevoegd aan stalling bewerkformulier
- 🖌️ OmschrijvingTarieven-veld nu zichtbaar en bewerkbaar in stalling bewerkformulier
- 🖌️ OmschrijvingTarieven-veld getoond in stalling details en tariefoverzicht

**Technisch**

- ✨ Nieuwe API endpoints: `/api/protected/tariefcodes` voor volledige CRUD operaties op tariefcodes
- ✨ Nieuwe API endpoint: `/api/protected/tariefcodes/seed` voor seed-functionaliteit
- ✨ Nieuwe hook `useTariefcodes` voor data fetching van tariefcodes
- ✨ TypeScript types toegevoegd voor tariefcodes (`src/types/tariefcodes.ts`)
- ✨ Validatie en error handling verbeterd bij het aanmaken van stallingen met sectie checks
- 🐛 Fix: OmschrijvingTarieven-veld wordt nu correct opgeslagen en getoond

## VeiligStallen 2025-10-30 (wachtrij-feature branch)

**Beheer / Monitoring**

- ✨ Nieuw: Pagina voor monitoring van verschillende wachtrijen toegevoegd aan het beheerdersmenu
- ✨ Nieuwe componenten voor tonen van wachtrijstatus, samenvattingen en webservice logs
- ✨ Backend API-endpoints voor uitlezen van wachtrijstatus (wachtrij_betalingen, pasids, sync, transacties, webservice_log)
- ✨ Nieuwe TypeScript types en utilities voor wachtrij-monitoring (uitgezet op acceptance ivm timeouts)

**Technisch**

- ✨ Integratie van wachtrij types, API’s en UI in beheerdersschermen
- ✨ Optimalisatie van de paginas

## VeiligStallen 2025-10-30

**Beheer**

- 🐛 E-mailadres moet uniek zijn bij gebruikersbeheer; verbeterde foutmeldingen bij validatie
- 🖌️ Alleen aan een stalling gekoppelde exploitanten worden nu getoond in 'Beheerder' instellingen
- 🗑️ Voor data-owners: FAQ verwijderd uit linkermenu; aanmaken nieuwe pagina uitgeschakeld; 'Tips' verwijderd

**Stalling-beheer**

- 🖌️ Inhoud van de tab 'Beheerder' verplaatst naar een eigen component voor betere onderhoudbaarheid
- ✨ Verbeterde afhandeling van de instelling "Parking.FMS"

**Technisch**

- 🗂️ Documentatie uitgebreid:
  - Toegevoegd: `SERVICES_DATASTANDARD.md`
  - Toegevoegd: `SERVICES_REPORTING.md`
  - Hernoemd: `SERVICES.md` ➜ `SERVICES_FMS.md`

## VeiligStallen 2025-10-29

**Stalling-beheer**

- 🖌️ Verbeterd openingstijden bewerkingsformulier met radio buttons voor snel selecteren:
  - "Gehele dag geopend" (24 uur)
  - "Gehele dag gesloten" (alleen voor niet-NS stallingen)
  - "Onbekend"
  - Aangepaste openingstijden (met tijdvelden)

- ✨ Nieuwe implementatie van sectiebeheer
- ✨ Beheer van meerdere secties per stalling met hiërarchische inline editing
- ✨ Automatische aanmaak standaard sectie bij nieuwe stalling (sectie 1 met externalId `StallingsID_001`)
- ✨ Automatische generatie van standaard `sectie_fietstype` entries voor alle fietstypen bij aanmaken sectie
- ✨ Automatische generatie van StallingsID in formaat `ZipID_index` (bijv. `mb02_001`) bij nieuwe stalling
- ✨ Automatische generatie van sectie-ID's bij aanmaken nieuwe secties (sequentieel genummerd: `StallingsID_001`, `StallingsID_002`, etc.)
- ✨ Automatisch bijwerken van `isKluis` flag bij wijziging stallingtype naar/van "fietskluizen" (voor alle secties)
- ✨ Automatische `isKluis` flag voor nieuwe secties gebaseerd op stallingtype (true voor "fietskluizen", false anders)
- ✨ Validatie: laatste sectie kan niet worden verwijderd (minimaal 1 sectie vereist)
- ✨ Validatie: voorkomt negatieve capaciteitswaarden
- 🖌️ Verbeterde layout sectiebewerkingsformulier (compactere capaciteitstabel, gesorteerde weergave)
- 🖌️ StallingsID-veld toegevoegd aan "Algemeen" tab (leesbaar voor beheerders, bewerkbaar voor superadmin)
- 🔒 Migratie van publieke naar beschermde API endpoints voor alle stallingoperaties
- 🗑️ Deprecated: publieke `/api/fietsenstallingen` endpoint (alle GET/PUT/DELETE/POST methoden verwijderd)

**Technisch**

- ✨ Nieuwe API endpoint: `/api/protected/fietsenstallingen/secties/[id]` voor volledige CRUD op secties
- ✨ Automatische capaciteitsberekening: totale stallingcapaciteit wordt bijgewerkt bij wijzigingen in secties
- ✨ TypeScript types toegevoegd voor sectiebeheer (`src/types/secties.ts`)
- ✨ Custom hook `useSectiesByFietsenstalling` voor data fetching
- ✨ Nieuwe `FormRadio` component voor radio button inputs
- ✨ Verbeterde state management voor openingstijden per dag (radio selectie per dagweek)
- ✨ Betere null handling voor openingstijden velden (`Date | null`)
- ✨ SQL queries voor database consistentie checks:
  - `check-capacity-consistency.sql` - Controleert overeenkomst tussen `Capacity` veld en berekende capaciteit uit secties
  - `check-iskluis-consistency.sql` - Controleert `isKluis` flag consistentie tussen stallingtype en secties
- ✨ Synchronisatie `isKluis` flag tussen stallingtype en secties in generieke service laag (`fietsenstallingen-service.ts`)
- ✨ Exception handling: Standaard sectie wordt automatisch aangemaakt bij nieuwe stalling, inclusief alle fietstype entries
- 🐛 Fix: StallingsID generatie werkt nu correct bij aanmaken nieuwe stalling
- 🐛 Fix: `isKluis` flag wordt correct bijgewerkt bij typewijzigingen (zowel in protected als public API)
- 🐛 Fix: Verbeterde error handling en logging voor API calls
- 🗑️ Verwijderd: Oude "Capaciteit" tab code uit ParkingEdit component (vervangen door nieuwe implementatie)

## VeiligStallen 2025-10-23

- 🐛 Admin kan stallingsafbeelding uploaden
- 🐛 Diverse verbeteringen in gebruikerservaring

## VeiligStallen 2025-02-01

**Stalling-details**

- ✨ Toon 'Statistieken' voor ingelogde gebruikers

**Beheer**

- ✨ Totale herziening van de rechtenstructuur
- ✨ Vele FMS-schermen zijn herontwikkeld en vereenvoudigd
- ✨ Nieuwe rapportage-grafieken

## VeiligStallen 2025-01-03

Deze hotfix deployment is gepubliceerd om een bug op te lossen. Als een beheerder aangepaste openingstijden had toegevoegd, werden deze niet zichtbaar in de app. Nu wel.

**Stallingslijst**

- 🐛 Fix openingstijden: uitzonderingen waren genegeerd

**Stalling-details**

- 🐛 Fix openingstijden: uitzonderingen waren genegeerd

## VeiligStallen 2024-04-11

**Stalling-details**

- ✨ Toon "Koop abonnement" knop bij stallingen
- ✨ Toon de 'extra services' van een stalling
- ✨ Toon de stallingsbeschrijving onder de titel
- 🖌️ Verbeter weergave 'Abonnementen'
- 🐛 Opgelost: openingstijden toonden de 'wintertijd'
- 🐛 Tijdelijk bericht: openingstijd-uren kunnen niet worden bewerkt

**Stalling-beheer**

- ✨ Verberg (of activeer) een stalling voor gastgebruikers
- Verbeter uitleg die verschijnt als velden incorrect ingevuld zijn
- Verbeter beheer 'capaciteit'

## VeiligStallen 2024-04-02

**Algemeen**

- Nieuwe "Stalling aanmaken" in app header, voor ingelogde gebruikers

**Stallingen-beheer**

- Meld een nieuwe stalling aan als gastgebruiker
- Bij aanmelden stalling als gast: Verberg Capaciteit, Abonnementen en Beheerder
- Na opslaan voorgestelde stalling: Toon dat deze stalling 'doorgestuurd' is aan gemeente, en mogelijk later online komt

- Keur een aangemelde stalling goed als ingelogde gebruiker
- Knop: zet automatisch een marker op de kaart, op basis van adres
- Knop: vind automatisch adresgegevens op basis van de kaart-marker
- In bewerkmodus: geef de kaart 'vrij' voordat je de kaart-marker kunt verplaatsen
- Krijg validatie-meldingen voor stallingsvelden in bewerkdialoog (bijv: postcode)
- Zie notificatie na opslaan van een stalling

- Sla op wanneer de stalling is aangemaakt, en wanneer voor het laatst gewijzigd

**Stallingen-kaart**

- Op desktop, open direct stalling bij klik op kaart-marker

**Stallingen-filters**

- Nieuw "Aangemelde stallingen" filter, dat alleen gesuggereerde stallingen toont

## VeiligStallen 2024-03-03

**Algemeen**

- Toon FMS-link voor ingelogde gebruikers, in het hoofdmenu

**Stallingen-verkenner**

- Toon adres als tooltip bij een mouseover over het adres in de stallingenlijst

## VeiligStallen 2024-02-13

**Login**

- ✨ Je kunt nu in het loginformulier op <enter> drukken om in te loggen
- 🖌️ Verbeterde "inloggegevens waren onjuist" weergave

**Stallingen-verkenner**

- 🐛 Opgelost: Site crashte als je vanaf een content-pagina een stalling opende
- 🐛 Opgelost: Binnen een gemeente toonde NS-stallingen niet in de lijst. We geven nu altijd alle op de kaart zichtbare stallingen weer in de stallingenlijst onder de zoekbalk

## VeiligStallen 2024-02-12

**Stallingen-verkenner**
_De zoekbalk en stallingenlijst_

- De werking van de zoekfunctie is geupdate ([57](https://github.com/Stichting-CROW/fietsberaad-veiligstallen-app/issues/57#issuecomment-1937910219))
    - Indien uitgezoomd en geen zoekterm opgegeven: Toon geen stallingen
    - Indien uitgezoomd en zoekterm opgegeven: Doorzoek alle stallingen
    - Indien ingezoomd en zoekterm opgegeven:
        - Doorzoek alle stallingen
        - Toon de op de kaart zichtbare stallingen als eerst in de zoekresultaten
    - Indien ingezoomd en geen zoekterm opgegeven: Toon enkel stallingen van de actieve gemeente

**Stallingsinformatie**

- 🐛 Opgelost: Openingstijden NS-stallingen tonen foutief "gesloten" ipv 24h ([56](https://github.com/Stichting-CROW/fietsberaad-veiligstallen-app/issues/56)). Zoek op "Bemenste fietsenstalling Rotterdam" om een voorbeeld te zien van de nu juiste werking.

**Stallingsdetails**

- 🐛 Opgelost: Enkele stallingen laadden niet ([59](https://github.com/Stichting-CROW/fietsberaad-veiligstallen-app/issues/59
)). De stallingen hadden geen juiste lat/lon locatie. We hebben ervoor gezorgd dat bij foutieve locatiedata de site niet vastloopt.


