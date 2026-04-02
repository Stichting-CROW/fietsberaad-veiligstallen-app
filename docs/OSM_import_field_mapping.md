# VeiligStallen naar OSM tag mapping

Dit document beschrijft hoe velden uit de VeiligStallen feed vertaald kunnen worden naar OpenStreetMap-tags voor bestaande of nieuwe fietsenstalling-objecten.

Belangrijk: voer geen bulkimport uit zonder voorafgaande afstemming met de OSM-community en het import-proces.

## Basis tags per fietsenstalling

- `amenity=bicycle_parking`
- `name=*` (indien officiële naam beschikbaar)
- `operator=*` (exploitant)
- `capacity=*` (totale capaciteit)

## Mapping tabel

Bron voor deze tabel is de GeoJSON response van:

- `/api/osm/fietsenstallingen`

| API veld (GeoJSON) | OSM tag | Opmerking |
|---|---|---|
| `geometry.coordinates` | geometrie (node/way) | Puntlocatie van de stalling in `[lon, lat]`. |
| `properties.amenity` | `amenity=*` | Staat op `bicycle_parking`. |
| `properties.ref:veiligstallen` | `ref:veiligstallen=*` | Stabiele externe referentie voor updates/conflatie. |
| `properties.name` | `name=*` | Gebruik alleen als het een publieke/bruikbare naam is. |
| `properties.operator` | `operator=*` | Naam exploitant. |
| `properties.capacity` | `capacity=*` | Totale capaciteit (integer). |
| `properties.opening_hours` | `opening_hours=*` | Staat al in OSM opening_hours-notatie. |
| `properties.website` | `website=*` | Publieke URL. |
| `properties.contact:phone` | `contact:phone=*` | Alleen als publiek telefoonnummer aanwezig is. |
| `properties.addr:street` | `addr:street=*` |  |
| `properties.addr:housenumber` | `addr:housenumber=*` |  |
| `properties.addr:postcode` | `addr:postcode=*` |  |
| `properties.addr:city` | `addr:city=*` |  |
| `properties.bicycle_parking` | `bicycle_parking=*` | Subtype, bijv. `lockers`, `stands`, `building`. |
| `properties.supervised` | `supervised=*` | Waarde `yes/no` voor bewaakt/onbewaakt. |
| `properties.fee` | `fee=*` | Afgeleid uit tarieftekst (`yes/no`). |
| `properties.charge:description` | `charge:description=*` | Vrije tekst met tariefomschrijving. |
| `properties.veiligstallen:capacity_per_vehicle_type` | `capacity:description=*` (optioneel) | Tijdelijk als vrije tekst; later eventueel verfijnen naar specifieke sub-tags. |
| `properties.veiligstallen:services` | `description=*` of service-tags | Per service beoordelen; geen ongestructureerde massale tagset toevoegen zonder afspraken. |
| `properties.source` | `source=*` | Staat op `VeiligStallen`. |

## Aanbevolen subtype mapping

Vertaal `properties.veiligstallen:type_name` (of intern type) bij voorkeur als volgt:

- Bewaakte stalling -> `bicycle_parking=building` (of `shed`, afhankelijk van feitelijke situatie)
- Geautomatiseerde stalling -> `bicycle_parking=lockers` (of passend alternatief)
- Stalling met toezicht -> `bicycle_parking=shed` of `building` + `supervised=yes`
- Onbewaakte stalling -> `bicycle_parking=stands` of `shed` + `supervised=no`

Let op: controleer altijd de fysieke situatie op locatie/luchtfoto en bestaande objecttags voordat je wijzigt.

## Conflatie regels (kort)

- Match eerst op `ref:veiligstallen`; als afwezig: op afstand + naam + adres.
- Geen automatische overschrijving van bestaande `name`, `operator`, `capacity` zonder review.
- Bij onzekere match: handmatige controle in review-queue.
