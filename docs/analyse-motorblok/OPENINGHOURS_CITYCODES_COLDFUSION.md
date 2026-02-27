# Opening Hours and Services: ColdFusion Logic for V3 Citycodes

**Source:** `coldfusion-broncode/remote/REST/BaseRestService.cfc` (getLocation, lines 223–283)

---

## Rule: Field inclusion is driven by the `fields` parameter

In ColdFusion, **openinghours** and **services** are included in the location response **only when** the `fields` parameter allows it:

### Openinghours (lines 223–283)

```cfml
<cfif arguments.fields eq "*" or FindNoCase("location.openinghours", arguments.fields)>
    <cfset local.result['openinghours'] = {}>
    ...
</cfif>
```

- **Included when:** `fields eq "*"` OR `"location.openinghours"` is present in the fields list
- **Excluded when:** `fields` is empty or does not contain `"location.openinghours"`

### Services (lines 282–284)

```cfml
<cfif arguments.fields eq "*" or ListFind(arguments.fields, "location.services")>
    <cfset setIfExists(local.result, "services", local.bikepark.getAllServices())>
</cfif>
```

- **Included when:** `fields eq "*"` OR `"location.services"` is in the fields list
- **Excluded when:** `fields` is empty or does not contain `"location.services"`

---

## V3 citycodes flow

| Endpoint | fms_service.cfc | BaseRestService | fields param |
|----------|-----------------|-----------------|--------------|
| GET /citycodes | getCities | getCities → getCity → getLocations → getLocation | `restargsource="query"`, no default |
| GET /citycodes/{citycode} | getCity | getCity → getLocations → getLocation | `restargsource="query"`, no default |
| GET /citycodes/{citycode}/locations | getLocations | getLocations → getLocation | `restargsource="query"`, no default |

When the client does **not** pass `?fields=` in the URL, the `fields` argument is typically **empty** (or undefined). In that case, ColdFusion excludes openinghours and services.

When the client passes `?fields=*`, openinghours and services are included.

---

## getCities cache (fms_service.cfc lines 9–22)

The citycodes list is cached for 30 minutes. The cache is built with whatever `fields` value the **first** request in that window had. So:

- If the first request was `GET /citycodes` (no fields) → cache has locations **without** openinghours/services
- If the first request was `GET /citycodes?fields=*` → cache has locations **with** openinghours/services

This explains why "opening hours is showing in some old records": the cache state depends on which request populated it.

---

## Implementation recommendation

1. **Pass `fields` through** to `buildColdFusionLocation` (or equivalent).
2. **Include openinghours** when: `fields === "*"` OR `fields` includes `"location.openinghours"`.
3. **Include services** when: `fields === "*"` OR `fields` includes `"location.services"`.
4. **forV3Citycodes** can remain as a separate flag for other omissions (exploitantname, sections, station, city, address, postalcode). For openinghours and services, the ColdFusion logic is purely fields-based; there is no special "citycodes list vs citycodes/{citycode}" rule in the ColdFusion code.

---

## Current Next.js behaviour

The Next.js API defaults `fields` to `"*"` when the client omits it. The ColdFusion REST layer does **not** default `fields` when it is absent from the query string, so it receives an empty value. As a result:

- **Old API (citycodes list):** When the cache was built without `?fields=*`, locations have no openinghours/services.
- **New API:** With `fields="*"` default, locations always include openinghours/services.

To match the old citycodes list response, the Next.js implementation uses `forV3Citycodes=true` to omit openinghours and services for the citycodes list, effectively mimicking the case where the ColdFusion cache was built without `fields=*`.
