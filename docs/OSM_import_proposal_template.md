# OSM importvoorstel template (VeiligStallen)

Ik werk aan VeiligStallen, een open data bestand met fietsenstallingendata zoals naam, beheerder, openingstijden en diensten. Het projectteam van VeiligStallen wil graag de open data delen met Open Street Map, zodat de Nederlandse fietsenstallingendata op OSM zo gedetailleerd en actueel mogelijk is.

Dit document dienst als basis voor een importvoorstel op de OSM Wiki, voor afstemming met de Nederlandse community en `imports@openstreetmap.org`.

## 1) Samenvatting

- **Projectnaam:** VeiligStallen fietsenstallingen NL
- **Doel:** Bestaande OSM-fietsenstallingen verrijken en ontbrekende stallingen toevoegen.
- **Gebied:** Nederland
- **Type bewerking:** Conflatie + handmatige review (geen ongecontroleerde bulkimport)

## 2) Databron

- **Bronhouder:** CROW / VeiligStallen
- **Bron-URL:** `https://beta.veiligstallen.nl/api/osm/fietsenstallingen`
- **Query parameters:**
  - `cbsCode` (optioneel, integer) voor filtering op gemeente via CBS gemeentecode
  - Voorbeeld Utrecht: `https://beta.veiligstallen.nl/api/osm/fietsenstallingen?cbsCode=344`
  - Bij ongeldige waarde geeft de API een `400` foutmelding
- **Formaat:** GeoJSON (`FeatureCollection` met `Point` geometrie)
- **Updatefrequentie:** als overheden de fietsenstallingendata updaten, ongeveer eens per halfjaar
- **Dekking:** heel Nederland, voor alle deelnemende gemeenten (verschilt door tijd)

## 3) Licentie en toestemming

Bron: [https://fietsberaad.nl/Kennisbank/Fietsparkeer-Management-Systeem-(VeiligStallen)](https://fietsberaad.nl/Kennisbank/Fietsparkeer-Management-Systeem-(VeiligStallen))

Gepubliceerde datadelingstekst:

> CROW-Fietsberaad biedt alle statische informatie over de stallingen plus informatie over de actuele bezetting aan als open data. De informatie kan worden opgevraagd op gemeente- of locatieniveau. De data zijn vrij te gebruiken, maar we stellen het zeer op prijs hiervan op de hoogte te worden gesteld. Dit kan via fietsberaad@crow.nl onder vermelding van “Gebruik Open Data VeiligStallen.nl”. CROW Fietsberaad noch de gemeenten zijn aansprakelijk voor de juistheid van de gegevens.

- **OSM-compatibiliteit bevestigd:** [ja/nee]
- **Schriftelijke toestemming beschikbaar:** [ja/nee, link/bijlage]
- **Voorwaarden/herkomst data gedocumenteerd:** [ja/nee]

Aanbeveling voor OSM-import:

- Vraag expliciet per e-mail bevestiging dat bijdragen aan OSM onder ODbL toegestaan zijn (inclusief afgeleide data en herdistributie), en archiveer deze bevestiging bij het importvoorstel. Zonder expliciete ODbL-compatibele toestemming geen import starten.

## 4) Data model en tagmapping

Gebruik mapping uit:

- `docs/OSM_import_field_mapping.md`

Kern:

- `amenity=bicycle_parking`
- `ref:veiligstallen=*`
- `capacity=*`
- `operator=*`
- `opening_hours=*`
- `website=*`
- `supervised=*`
- `bicycle_parking=*`

Belangrijke noot:

- De OSM endpoint levert al OSM-gerichte properties (zoals `amenity`, `ref:veiligstallen`, `capacity`, `operator`, `opening_hours`, `supervised`, `bicycle_parking`) en aanvullende `veiligstallen:*` velden voor review/conflatie.

## 5) Conflatie methode

- **Stap 1:** Bestaande OSM-objecten ophalen in pilotgebied.
- **Stap 2:** Match op `ref:veiligstallen`, anders op afstand + naam + adres.
- **Stap 3:** Kandidaten classificeren:
  - `match zeker` -> update voorstel
  - `mogelijk match` -> handmatige review
  - `geen match` -> nieuw object voorstel
- **Stap 4:** Handmatige validatie in JOSM (of vergelijkbaar).

## 6) Kwaliteitscontroles

- Controle op dubbele objecten.
- Controle op ongeldige geometrie.
- Controle op onrealistische capaciteit/openingstijden.
- Controle op tagconsistentie (`amenity=bicycle_parking` aanwezig).

## 7) Uitrolplan

- **Pilot 1:** 1 gemeente, max 100-200 objecten.
- **Reviewmoment:** community feedback verwerken.
- **Pilot 2:** 3-5 gemeenten.
- **Landelijke uitrol:** in batches per regio/gemeente.

## 8) Changesets en transparantie

- **Changeset bron-tag:** `source=VeiligStallen`
- **Changeset hashtag:** `#veiligstallen #osmnl`
- **Changeset comment:** `Conflation/update bicycle parking from VeiligStallen (reviewed)`
- Publiceer query of dashboard met uitgevoerde wijzigingen.

## 9) Rollback plan

- Bewaar alle gewijzigde object-ID's per batch.
- Houd import-script + invoer snapshots per batch bij.
- Bij fouten: rollback per batch met reproducerbare procedure.

## 10) Contact

- **Organisatie:** CROW / VeiligStallen
- **Technisch contact:** bart@tuxion.nl
- **Community contact:** bartwrt, bart@tuxion.nl
