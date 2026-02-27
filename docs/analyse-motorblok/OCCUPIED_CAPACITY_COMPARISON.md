# Occupied/Capacity: ColdFusion vs Next.js Comparison

Comparison of how `occupied`, `free`, and `capacity` are calculated for V3 locations.

## ColdFusion (BaseRestService.cfc, Bikepark.cfc, BikeparkSection.cfc)

### Occupied
- **Bikepark.getOccupiedPlaces()**: Sum over all sections of `section.getOccupiedPlaces()`
- **BikeparkSection.getOccupiedPlaces()**:
  - **If hasPlace()** (fietskluizen): Count lockers where `place.getCurrentStatus() != FREE` (real-time locker status)
  - **Else**: Return `getOccupation()` = `Bezetting` column from `fietsenstalling_sectie`

### Capacity
- **BaseRestService** uses `bikepark.getNettoCapacity()` for the `capacity` field
- **Bikepark.getNettoCapacity()**: Sum over sections of `section.getNettoCapacity()`
- **BikeparkSection.getNettoCapacity()**: `getCapacity() - bulkreservation.getNumber()` (when bulkreservation exists for today)
- **BikeparkSection.getCapacity()**: Sum of `sectionBikeTypes.Capaciteit` = **secties_fietstype.Capaciteit** (NOT fietsenstalling_sectie.capaciteit). No Toegestaan filter in CF code.

### Free
- **Bikepark.getFreePlaces()**: `getCapacity() - getOccupiedPlaces()`, clamped to ≥ 0
- **Bikepark.getCapacity()** (used for free): Returns `variables.capacity` (fietsenstallingen.Capacity) when set and numeric, else `calculateCapacity()` (sum of secties_fietstype)

### Sections
- **getBikeparkSections()**: One-to-many relation, **no `where` clause** – includes all sections (no isactief filter in ORM)
- Sections can be disabled via `fietsenstalling_sectie.isactief`, but ColdFusion does **not** filter by it for capacity/occupied or section listing

---

## Next.js (fms-v3-service.ts)

### Occupied
- Sum of `Bezetting` from `fietsenstalling_secties` where `isactief: true`
- Always uses `Bezetting` column – **does not** use locker statuses for fietskluizen

### Capacity
- Sum of `capaciteit` from `fietsenstalling_secties` where `isactief: true`
- Fallback to `fietsenstallingen.Capacity` when section sum is 0
- **Does not** use secties_fietstype.Capaciteit
- **Does not** subtract bulkreservations

### Free
- `totalCapacity - totalBezetting`, clamped to ≥ 0

### Sections
- Filtered by `isactief: true`

---

## Differences (pre-alignment)

*The table below documented differences before the 2026-02 alignment. See **Status** section for current implementation.*

| Aspect | ColdFusion | Next.js (before alignment) |
|--------|------------|---------|
| **Occupied (non-locker)** | Bezetting | Bezetting ✓ |
| **Occupied (fietskluizen)** | Count locker statuses (place.getCurrentStatus) | Bezetting (may differ) |
| **Capacity source** | secties_fietstype.Capaciteit (sum per section) | fietsenstalling_sectie.capaciteit |
| **Bulkreservations** | Subtracted from capacity (getNettoCapacity) | Not applied |
| **Section filter** | All sections (no isactief in ORM) | isactief: true only |

---

## Status: ✅ Aligned (2026-02)

Next.js implementation now matches ColdFusion:

1. **Capacity**: Sum of secties_fietstype.Capaciteit per section; bulkreservations for today subtracted (getNettoCapacity)
2. **Fietskluizen occupied**: BikeparkSection.getOccupiedPlaces() loops places, counts where place.getCurrentStatus() neq place.FREE. Place.getCurrentStatus(): if getStatus() eq "" then setStatus(calculateStatus()), return getStatus() MOD 10. When status is set, ColdFusion returns getStatus() MOD 10 immediately (never checks getBikeParked). So: (status set and status MOD 10 != 0) OR (status empty and open transaction by PlaceID).
3. **Non-locker occupied**: Bezetting column
4. **Bulkreservations**: Excluded from capacity when Startdatumtijd date = today, Einddatumtijd >= now, no exception for today
5. **Section filtering**: No isactief filter (matches ColdFusion getBikeparkSections)
6. **Free**: getCapacity() - getOccupiedPlaces(), clamped to ≥ 0

---

## Capacity=0 edge case (2026-02)

**Bikepark.getCapacity()** returns `fietsenstallingen.Capacity` when "set and numeric". This includes `Capacity=0`: the old API then uses 0 for capacityForFree, so `free = max(0, 0 - occupied) = 0`. The Next.js implementation was incorrectly excluding 0 (`capVal > 0`); it now uses Capacity when set and numeric (`row.Capacity != null && !Number.isNaN(capVal)`), matching ColdFusion for citycode 5304 and similar cases.

## Known data accuracy issues (2026-02)

**V3 citycodes**: Capacity and occupation data in the V3 citycodes response may not be accurate. Example: Aalburg (citycode 4200), location 4200_001 "De Kromme Nol" – old API and new API have shown differing capacity/free values (e.g. 10/10 vs 90/90). Root cause not yet identified; ColdFusion source code follows the documented flow. Treat capacity/occupied/free in citycodes as indicative only until resolved.
