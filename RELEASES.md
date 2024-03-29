# App updates VeiligStallen

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


