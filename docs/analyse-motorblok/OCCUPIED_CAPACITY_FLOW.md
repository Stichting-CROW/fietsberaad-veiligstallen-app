# Occupied/Capacity/Free: Complete Flow from ColdFusion Source

Traced from `coldfusion-broncode/` – output fields to database source.

---

## 1. API Output (BaseRestService.cfc getLocation)

| Output field | Source |
|--------------|--------|
| `occupied` | `bikepark.getOccupiedPlaces()` (always) |
| `free` | `bikepark.getFreePlaces()` (always) |
| `capacity` | `bikepark.getNettoCapacity()` (only when `bikepark.getCapacity() > 0`) |

---

## 2. Bikepark (Bikepark.cfc, table fietsenstallingen)

### getOccupiedPlaces()
- Loops `getBikeparkSections()`, sums `section.getOccupiedPlaces()`

### getFreePlaces()
- `getCapacity() - getOccupiedPlaces()`, clamped to ≥ 0

### getCapacity()
- If `variables.capacity` is set and numeric → return it (from **fietsenstallingen.Capacity**)
- Else → `calculateCapacity()` = sum of `section.getCapacity()` over all sections

### getNettoCapacity()
- Sum of `section.getNettoCapacity()` over all sections

### getBikeparkSections()
- ORM relation `bikeparkSections`: one-to-many BikeparkSection, `fkcolumn="fietsenstallingsid"`
- **No `where` clause** → all rows from **fietsenstalling_sectie** for this bikepark
- **No isactief filter**

---

## 3. BikeparkSection (BikeparkSection.cfc, table fietsenstalling_sectie)

### getCapacity()
```cfml
<cfloop array="#getSectionBikeTypes()#" index="local.capacity">
    <cfset local.total += local.capacity.getCapacity()>
</cfloop>
```
- Sum of **all** sectionBikeTypes – **no Toegestaan filter**
- Source: **sectie_fietstype.Capaciteit** (via SectionBikeType.getCapacity())

### getNettoCapacity()
- `getCapacity() - getBulkreservationForDate().getNumber()` when bulkreservation exists for today
- Bulkreservation: **bulkreservering** where Startdatumtijd date = today, no exception for today

### getOccupiedPlaces()
- **If hasPlace()** (fietskluizen): count places where `place.getCurrentStatus() != FREE` (locker status)
- **Else**: return `getOccupation()` = **fietsenstalling_sectie.Bezetting**

### getSectionBikeTypes()
- ORM relation `sectionBikeTypes`: one-to-many SectionBikeType, `fkcolumn="SectieID"`
- **No `where` clause** → all rows from **sectie_fietstype** for this section
- **No `orderby`** → order is undefined (database default). Next.js uses `ORDER BY SectionBiketypeID ASC` (insertion order). See API_PORTING_PLAN.md §14.1 and Appendix A.11 for the biketype sort uitzondering and ColdFusion fix.

---

## 4. SectionBikeType (SectionBikeType.cfc, table sectie_fietstype)

| Property | Column | DB source |
|----------|--------|-----------|
| `capacity` | Capaciteit | **sectie_fietstype.Capaciteit** |
| `isBikeTypeAllowed` | Toegestaan | sectie_fietstype.Toegestaan |

- `getCapacity()` returns `variables.capacity` (Capaciteit)
- **Toegestaan is never used in getCapacity()** – BikeparkSection sums all sectionBikeTypes

---

## 5. Database Source Summary

| Output | Source fields |
|--------|---------------|
| **capacity** (API) | Sum over sections of (sum of sectie_fietstype.Capaciteit) minus bulkreservering.Aantal |
| **free** | (fietsenstallingen.Capacity OR sum of sectie_fietstype) − occupied |
| **occupied** | Sum of fietsenstalling_sectie.Bezetting (or locker status count for fietskluizen) |

### Tables
- **fietsenstallingen**: Capacity (used for free when set)
- **fietsenstalling_sectie**: Bezetting (occupied), links to sectie_fietstype via SectieID
- **sectie_fietstype**: Capaciteit (capacity per bike type), Toegestaan (not used in capacity)
- **bulkreservering**: Aantal, SectieID, Startdatumtijd, Einddatumtijd

### Filters applied in ColdFusion
- **Sections**: none (all fietsenstalling_sectie rows; no isactief)
- **SectionBikeTypes**: none (all sectie_fietstype rows; no Toegestaan)

---

## 6. Section Output (BaseRestService.getSection)

For biketypes in section output:
- `allowed` = `sectionbiketype.getIsBikeTypeAllowed()` → **sectie_fietstype.Toegestaan**
- `capacity` = `sectionbiketype.getCapacity()` **only when** `getIsBikeTypeAllowed() and getCapacity() > 0` → **sectie_fietstype.Capaciteit**

So Toegestaan **is** used for section biketypes display (whether to show capacity), but **not** for location-level capacity/free/occupied.
