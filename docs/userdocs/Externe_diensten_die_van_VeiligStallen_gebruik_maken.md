# Externe diensten die van VeiligStallen gebruik maken

De fietsenstallingendata in VeiligStallen kan opgehaald worden via API's, zodat ook andere diensten ervan gebruik kunnen maken. Zo kan een gemeente een kaart met diens fietsenstallingen tonen op hun site, en routeplanners zoals die van ANWB, de Fietsersbond en Google Maps kunnen de fietsenstallingendata eenvoudig inladen. Zo is de data altijd actueel.

## Diensten die gebruik maken van VeiligStallen data

- Fietsersbond routeplanner
- ANWB routeplanner
- Google Maps
- Open Street Map

## Beschikbare API's

TODO: Link naar API's

## OpenStreetMap (OSM) voorbereiding

We bereiden integratie met OSM voor middels import en conflatie. Zie:

- `docs/OSM_import_field_mapping.md`
- `docs/OSM_import_proposal_template.md`

## Zo komt VeiligStallen-stallingdata in Google Maps

CROW heeft zich aangemeld bij het Google Maps Partner Program om data eenvoudig aan Google Maps en Google Transit te kunnen aanbieden. De data die wordt gedeeld komt uit deze CSV API endpoint URL:

- `https://beta.veiligstallen.nl/api/google/fietsenstallingen?format=google_poi`

en bevat de volgende velden:

- `ID` (unieke interne ID van de stalling)
- `NAME` (naam van de stalling)
- `TYPE` (Google POI type, nu `bicycle_parking`)
- `LAT` (breedtegraad)
- `LON` (lengtegraad)
- `FULL_AD` (volledig adres)
- `ST_NUM` (huisnummer)
- `ST_NAME` (straatnaam)
- `CITY` (plaats)
- `STATE` (provincie/staat, indien beschikbaar)
- `ZIP` (postcode)
- `PHONE` (telefoonnummer, indien beschikbaar)
- `WEBSITE` (URL van de stalling)
- `MON` t/m `SUN` (openingstijden per dag)
- `AP_LAT` (breedtegraad toegangspunt)
- `AP_LON` (lengtegraad toegangspunt)
- `ATTR` (extra attribuut, zoals subtype)
- `CAPACITY_TOTAL` (totale capaciteit)
- `CAPACITY_PER_VEHICLE_TYPE` (capaciteit per voertuigtype)
- `SERVICES` (beschikbare services)
- `TARIFFS` (tariefomschrijving op basis van tariefcode)
- `GUARDED` (yes/no)
- `OPERATOR` (exploitant)
