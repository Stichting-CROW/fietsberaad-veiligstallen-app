# App updates VeiligStallen

## VeiligStallen 2026-01-06 pt 2.

**Rapportage**

- 🖌️ X-as labels zijn beter geformatteerd. Bijvoorbeeld: "1 dec." ipv "Dec.-1" en "2025-w1" ipv "2025-01"
- 🖌️ X-as labels hebben meer ruimte en worden daardoor minder vaak 'afgeknipt'
- 🖌️ Absolute bezetting grafiek heeft nu capaciteit-lijnen zonder 'markers' (rechte horizontale lijnen)
- 🐛 Opgelost: Dag voor de geselecteerde periode werd getoond met 0 waarde. Die dag had helemaal niet moeten worden weergegeven
- 🐛 Opgelost: Periodeselectie dagA t/m dagB, toonde dagA-1 t/m dagB-1

## VeiligStallen 2026-01-06

**Rapportage**

Rapportage: Procentuele bezetting grafiek

- 'Databron'-selectiebalk toegevoegd

Rapportage: Absolute bezetting grafiek

- Twee lijnen van dezelfde stalling hebben nu dezelfde kleur
- Geen gestippelde lijn meer voor "Capaciteit"

Rapportage: Algemeen

- Titel boven de grafiek is nu 'Type grafiek' in plaats van 'Data-eigenaar'
- X-as toont juiste waardes
- Elke nacht worden geaggregeerde datasets automatisch gegenereerd ('cache'), voor snel laden van de grafieken

**Beheer algemeen**

- Module-beheer toegevoegd
- Linkermenu verbergt automatisch menu-items zodat je alleen de de modules ziet waar je toegang toe hebt
- 'Fiets en win' module verwijderd

**Stallingbeheer**

- Bij beheer fietsenstallingen is er nu een knop 'Bekijk op website'
- Log-informatie toegevoegd: stalling [toegevoegd / laatst bewerkt] door [gebruiker] op [datumtijd]
- Nieuwe velden toegevoegd aan bewerkscherm: Description, MaxStallingsduur, IsStationsstalling, IsPopup

**Gebruikersbeheer**

- Beheerder kan een gebruiker een 'stel je wachtwoord in' mail sturen
- Als beheerder het wachtwoord van een gebruiker wijzigt, ontvangt de gebruiker een mail
- Fix 'Archiveer gebruiker' in geavanceerd gebruikersbeheer

**Wachtwoord instellen**

- Voor gebruikers is er een nieuwe 'stel je wachtwoord in' flow inclusief auto login na instellen wachtwoord

**Wachtwoord vergeten**

- Wachtwoord vergeten knop toegevoegd aan login-scherm
- Gebruiker kan nu Wachtwoord instellen via de nieuwe 'wachtwoord vergeten' flow

**FAQ**

- 'Laatst bewerkt' toegevoegd aan FAQ-item-bewerkpagina
- Volgorde van FAQ-items nu in te stellen

**Dataleveranciers**

- Nieuwe testpagina toegevoegd voor het ophalen van NS-data

**Hulpmiddelen**

- Exporteertool voor exporteren alle pagina's en alle FAQ-items

## VeiligStallen 2025-12-16

- Op verschillende plekken verbeterde opmaak

**Stallingbeheer / Tarieven**

- Nieuw: Volledige tariefbewerkingsfunctionaliteit toegevoegd
- Nieuwe API endpoints voor tariefbeheer:
  - `GET/PUT /api/protected/fietsenstallingen/[id]/tarieven` - Ophalen en bijwerken van tarieven
  - Volledige CRUD operaties met validatie en transactie ondersteuning
- Nieuwe service laag `src/server/services/tarieven.ts`:
  - Functies voor ophalen, groeperen en opslaan van tariefregels
  - Ondersteuning voor verschillende scope types (stalling, sectie, fietstype)
  - Automatische migratie en consolidatie van tarieven bij wijziging van uniformiteit flags
- Automatische bijwerking van `EditorModified` en `DateModified` bij tariefwijzigingen
- Fix: Automatische bijwerking van parent `fietsenstallingen` record bij tariefwijzigingen (editorModified, dateModified)

**Database**

- Verwijderd: "Incorrecte Tarieven Opruimen" component uit database beheer + bijbehorende api endpoints
- Nieuw: Database diff testing tool (development only)

**Technisch**

- Nieuwe hooks:
  - `useBikeTypes` - Voor ophalen van fietstypen
  - `useSectiesByFietsenstalling` - Voor ophalen van secties per stalling
- Verwijderd: Deprecated `fietsenstallingen-service.ts` backend service

**Abonnementsvormen**

- ✨ Nieuw abonnementsvormenbeheer
  - First implementation of abonnementsvormen
  - Link to module, add conditions for field display, fixes (work in progress)
  - Add Abonnementen tab to parkingedit

**Rapportage**
- **Absolute Bezetting Grafiek**
  - Nieuw grafiektype voor absolute bezetting visualisatie
  - Databron selector toegevoegd
  - Floating point problemen opgelost (retourneert nu integers)
  - Onthoudt laatst geselecteerde stalling
  - "No bikeparks found" fout opgelost
  - Toon alleen stallingen met transactiedata voor absolute bezetting grafiek
  - Meerdere stallingen selecteren mogelijk
  - 'Kwartier' en 'uur' opties toegevoegd
  - 'Capaciteit' als gestippelde lijn weergegeven
  - Altijd "Uur" en "Kwartier" opties tonen voor absolute bezetting
  - Gedeelde tooltip voor <= 5 series
  - Eén kleur voor 2 lijnen van dezelfde stalling
  - Geen gestippelde lijn voor "Capaciteit" serie

- **Aanvullende Grafiek Verbeteringen** (niet gedocumenteerd in RELEASES.md)
  - URL voor elk grafiektype
  - Weekdag toevoegen aan uur/dag x-as
  - Zoekbalk toegevoegd aan BikeparkSelect
  - Grafiektypen als submenu van "Rapportage" in linkermenu
  - Tooltip titels van Stallingsduur grafiek gefixt

- ✨ Nieuwe grafiek: absolute bezetting
- ✨ Bij grafiek 'procentuele bezetting' is er de nieuwe filteroptie "Weekdagen"
- ✨ Bij elke grafiek kun je nu de getoonde stallingen filteren
- 🖌️ Grafiek heeft nu maximale breedte
- 🖌️ Grafiek is nu maximaal zo hoog als het kan, waardoor x-as altijd zichtbaar is
- 🖌️ Duidelijker periodeselectiebalk door toegevoegd icoon en vetgedrukte tekst
- 🖌️ Grafiektitel en paginatitels zijn duidelijker
- 🖌️ In de filters bovenin staat nu duidelijk de gekozen selectieoptie
- 🖌️ Balkgrafiek stallingsduur heeft nu kolombalken in plaats van samengestelde balk
- 🖌️ Diverse andere gebruikerservaringsverbeteringen voor Rapportage-grafieken

- **Overzichten tbv testen**
  - **Transacties overzicht**
    - Nieuw overzicht dat transactie overzicht functionaliteit

  - **Synchronisatie overzicht**
    - Nieuw overzicht dat controles (systeemchecks/validaties) toont

  - **Fietsenstalling Helpdesk Overzicht**
    - nieuw overzicht dat de beheerder tekst en link toont voor fietsenstallingen

## 🎨 UI/UX Verbeteringen

### Content & Formulieren
- Verbeterde content component
- Verbeterde form input component

### Tracking
- **Matomo site tracking code**
  - Matomo analytics tracking toegevoegd

## 🗄️ Database & Schema

### Prisma Schema
- Bijgewerkt Prisma schema (inclusief `HelpdeskHandmatigIngesteld` veld)
- Een aantal relaties opgeschoond / aangescherpt

### Configuratie Bestanden
- Bijgewerkt environment voorbeeld bestand
- Bijgewerkt gitignore

## VeiligStallen 2025-11-20

**Beheer**

- 🖌️ Verbeterd ontwerp voor het linkermenu
- 🖌️ Smallere organisatie-selector in topmenu

**Fietsenstallingen**

- ✨ Admin kan fietsenstallingen exporteren naar CSV
- ✨ Meer instelmogelijkheden voor "fietsenstalling-beheerder"
- ✨ Nieuw vrij invulveld "Extra diensten" bij fietsenstallingbeheer
  - Voorbeeldweergave op site
  - Stel in dat een fietsenstalling wordt beheerd door de eigen organisatie (bijv. de gemeente)
- Adres/postcode/plaats zijn nu optionele velden

**Gebruikersbeheer**

- ✨ Sta toe dat een exploitant beheerd wordt door een andere organisatie
- 🖌️ In gebruikersoverzicht: toon eerst de interne gebruikers (van eigen organisatie) en daarna de externe gebruikers
- 🖌️ In gebruikersoverzicht: verberg e-mailadres
- 🖌️ In gebruikersbewerkscherm bij bewerken van exploitanten: verberg e-mailadres
- 🐛 Fix: nieuwe gebruikers kunnen nu weer inloggen in oude FMS 
  - Automatische aanmaak van security_users_sites records bij nieuwe gebruikers
  - Partiele fix: moet nog verder doorgetest worden

**Rapportages**

- ✨ Gebruiker kan eenvoudig instellen van periode (van datum t/m datum)
- 🖌️ Eenvoudiger wisselen van rapportage middels nieuw 'rapportage-menu' aan de linkerkant
- 🖌️ Verbeterd filterontwerp

**Gemeente-beheer**

- ✨ Volledige bewerkfunctionaliteit voor gemeenten toegevoegd
  - Nieuwe kaart-editor component voor het bewerken van gemeentegrenzen
  - Toegevoegd: registratiedatum veld voor gemeenten
  - Verbeterde validatie en foutafhandeling bij gemeente-bewerkingen
  - Contactpersoon beheer toegevoegd aan gemeente API

**Organisatie-archivering**

- ✨ Nieuw: archiveringsfunctionaliteit voor organisaties
  - Gemeenten, exploitanten en dataproviders kunnen nu worden gearchiveerd
  - Gearchiveerde organisaties worden uitgesloten van standaard overzichten
  - Archiveringsstatus is bewerkbaar via beheerschermen

**Beveiliging**

- 🔒 Verbeterde beveiligingsrestricties voor exploitant-organisaties
  - Exploitanten kunnen geen exploitanten_toegangsrecht meer beheren
  - Automatische autorisatiecontrole voor exploitant-gemeente koppelingen
  - Vereenvoudigde component-level checks door verbeterde security profile

**Kaart & Navigatie**

- 🖌️ Kaart gebruikt nu zoom-niveau van contact wanneer gemeente in URL wordt opgegeven
  - Betere gebruikerservaring bij directe navigatie naar gemeente

**Technisch**

- ✨ Nieuwe API endpoints voor gemeente contactpersoon beheer
- ✨ Verbeterde modules_contacts API functionaliteit
- 🗑️ Opgeruimd: verwijderde overbodige component-level security checks

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


