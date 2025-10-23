# App updates VeiligStallen

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


