# Plan: Restructure Opening Hours for V3 citycodes/{citycode}/locations

**Endpoint:** `GET /v3/citycodes/{citycode}/locations`  
**Parameters:** `{ citycode: "3500" }`  
**Status:** Diff shows opening hours structure mismatch between old (ColdFusion) and new (Next.js) API.

---

## 1. Verify URL routing

Before changing logic, confirm both APIs hit the correct endpoints:

- **Old API:** `https://remote.veiligstallen.nl/rest/v3/citycodes/3500/locations`
- **New API:** `https://<nextjs-host>/api/fms/v3/citycodes/3500/locations` (or equivalent)

Check that the Next.js catch-all route `[[...path]].ts` correctly maps `/v3/citycodes/{citycode}/locations` to `getLocations(citycode)` and returns an array of locations (not citycodes or a single location).

---

## 2. Old API structure (ColdFusion source of truth)

**Source:** `broncode/remote/REST/BaseRestService.cfc` lines 311–386.

### 2.1 Top-level `openinghours` object

```
openinghours: {
  opennow: boolean,
  periods: [...],
  extrainfo?: string   // only when non-empty, from bikepark.getOpeninghours()
}
```

Key order: `opennow`, `periods`, `extrainfo` (when present).

### 2.2 Period formats

**24/7 (isNonStopOpen):**
- When `bikepark.isNonStopOpen()` is true (type `"fietskluizen"` OR all 7 days open 00:00–23:59):
  ```json
  periods: [{ "day": 0, "open": "0000" }]
  ```
- Key order: `day` first, then `open`.

**Regular hours (day-by-day iteration):**
- ColdFusion iterates days: `["su","mo","tu","we","th","fr","sa"]`
- Day number: `application.helperclass.getDayOfWeekByDaycode(day) - 1` → 0=Sunday, 1=Monday, …, 6=Saturday
- Uses `local.isopen` to merge consecutive open-all-day days into one period; adds `close` when hitting a closed/unknown day

**Period object shapes:**
1. **Open only** (start of open-all-day run): `{ "open": { "day": number, "time": "HHmm" } }`
2. **Close only** (end of run): `{ "close": { "day": number, "time": "HHmm" } }`
3. **Open + close** (regular hours): `{ "open": { "day": number, "time": "HHmm" }, "close": { "day": number, "time": "HHmm" } }`

**Close day when spanning midnight:** If `Day(open) != Day(close)`, then `close.day = getDayOfWeekByDaycode(day) MOD 7` (next calendar day).

**Key order in period objects:** `open` before `close` when both present.

---

## 3. Diff analysis (from user)

### 3.1 Location 131 (oldOnly vs newOnly)

| Old API | New API |
|---------|---------|
| `periods[0]: { open: "0000", day: 0 }` | `periods: {}` (empty) |

**Cause:** 
- Old: `isNonStopOpen()` is true (likely type `fietskluizen` or all days 00:00–23:59) → returns 24/7 period
- New: When `!hasAnyHours` (no Openingstijden in DB), returns `periods: []`. Does not check `isNonStopOpen` / location type.

**Fix:** If location type is `fietskluizen`, return 24/7 format `[{ day: 0, open: "0000" }]` regardless of Openingstijden. Also ensure key order is `day` then `open`.

### 3.2 Location 138

Old produces different period structure (e.g. Fri 0900–2300, Sat open/close) vs new (e.g. Mon 0000, Fri, Sat 0900–2300). The new API appears to:
- Use different day numbering or iteration order
- Not merge consecutive open-all-day days like ColdFusion
- Produce different open/close pairs

### 3.3 Location 139

Similar structural differences in how periods are built and merged.

---

## 4. Implementation tasks

### 4.1 Align `buildOpeningHours` with ColdFusion logic

**File:** `src/server/services/fms/fms-v3-openinghours.ts`

1. **isNonStopOpen handling**
   - Add parameter or check: when location type is `fietskluizen`, return `{ opennow: true, periods: [{ day: 0, open: "0000" }] }` immediately.
   - When no Openingstijden data but type is fietskluizen, still return 24/7 (do not return empty periods).

2. **24/7 period key order**
   - Change from `{ open: "0000", day: 0 }` to `{ day: 0, open: "0000" }` to match old API.

3. **Day iteration**
   - Use same order as ColdFusion: `["su","mo","tu","we","th","fr","sa"]` (Sunday first).
   - Map to day numbers: su=0, mo=1, …, sa=6 (match `getDayOfWeekByDaycode(day) - 1`).

4. **Period building algorithm**
   - Port the ColdFusion `local.isopen` logic:
     - `isOpenAllDay(day)`: if not `isopen`, add `{ open: { day, time: "0000" } }`, set `isopen = true`
     - `isClosedAllDay(day)` or `isOpeningUnknown(day)`: if `isopen`, add `{ close: { day, time } }`, set `isopen = false`
     - Regular hours: if `isopen` and open != "0000", add close for previous period; add `{ open, close }`, set `isopen = false`
   - Match `isOpenAllDay`: open 00:00 and close 23:59
   - Match `isClosedAllDay`: open 00:00 and close 00:00
   - Match `isOpeningUnknown`: no open/close for that day

5. **Close day when spanning midnight**
   - When close is next calendar day: `close.day = (dayNum + 1) % 7`.

6. **Time format**
   - Use `"HHmm"` (e.g. `"0900"`, `"2300"`). ColdFusion uses `LSTimeFormat(..., "HHmm")`.

### 4.2 Pass location type into opening hours

**File:** `src/server/services/fms/fms-v3-service.ts`

- Ensure `buildOpeningHours` receives `locationType` (or equivalent) so it can apply `isNonStopOpen` for `fietskluizen`.
- When building the location object, pass `row.Type` (or `locationtype`) into `buildOpeningHours`.

### 4.3 Openingstijden parsing

- Verify how `Open_zo`, `Dicht_zo`, etc. are parsed from the DB (fietsenstallingen.Openingstijden or similar).
- ColdFusion uses `getOpenByDayCode` / `getCloseByDayCode` which parse the Openingstijden string. Ensure the Next.js parser produces the same open/close times per day.

### 4.4 Exception hours (uitzonderingenopeningstijden)

- ColdFusion `getOpeningHoursByDayCode` uses `getExceptionOpeningHoursByDate` to override regular hours. If the old API uses exception data, the new API must do the same.

---

## 5. Swagger / old documentation

- Check `broncode/remote/docgenerator/apiDoc/` or similar for swagger/OpenAPI describing the `openinghours` schema.
- If present, use it as the canonical structure for `periods` and key order.

---

## 6. Validation

1. Run the FMS API compare page with `citycode=3500`.
2. For each location with `openinghours`, compare:
   - Key order in `openinghours` and in each `periods[i]`
   - Values for `opennow`, `periods`, `extrainfo`
3. Use deep-object-diff to confirm no remaining differences in `openinghours`.

---

## 7. Files to modify

| File | Changes |
|------|---------|
| `src/server/services/fms/fms-v3-openinghours.ts` | Rewrite to mirror ColdFusion algorithm; add isNonStopOpen for fietskluizen; fix key order |
| `src/server/services/fms/fms-v3-service.ts` | Pass location type into buildOpeningHours; ensure openinghours key order in response |
| `src/lib/openapi/fms-api.json` (if schema exists) | Update openinghours schema to match old API structure |

---

## 8. Reference: ColdFusion day codes

```
su = Sunday  → day 0
mo = Monday → day 1
tu = Tuesday → day 2
we = Wednesday → day 3
th = Thursday → day 4
fr = Friday → day 5
sa = Saturday → day 6
```

`getDayOfWeekByDaycode(day)` returns 1–7 (Sunday=1); subtract 1 for API output (0–6).
