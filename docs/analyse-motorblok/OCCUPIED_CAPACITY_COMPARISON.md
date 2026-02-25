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
- **BikeparkSection.getCapacity()**: Sum of `sectionBikeTypes.Capaciteit` = **secties_fietstype.Capaciteit** (NOT fietsenstalling_sectie.capaciteit)

### Free
- **Bikepark.getFreePlaces()**: `getCapacity() - getOccupiedPlaces()`, clamped to ≥ 0

### Sections
- **getBikeparkSections()**: One-to-many relation, **no `where` clause** – includes all sections (no isactief filter in ORM)

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

## Differences

| Aspect | ColdFusion | Next.js |
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
2. **Fietskluizen occupied**: For sections with places (fietsenstalling_plek), count lockers where status != 0 (Place.FREE)
3. **Non-locker occupied**: Bezetting column
4. **Bulkreservations**: Excluded from capacity when Startdatumtijd date = today, Einddatumtijd >= now, no exception for today
5. **Section filtering**: No isactief filter (matches ColdFusion getBikeparkSections)
6. **Free**: getCapacity() - getOccupiedPlaces(), clamped to ≥ 0
