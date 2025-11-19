## Abonnementsvormen – Security & Permissions Overview

### Roles and CRUD Rights
| Role (`VSUserRoleValuesNew`) | `abonnementsvormen_beheerrecht` | Effective Abonnementsvorm Rights |
| --- | --- | --- |
| `rootadmin`, `admin` | `create=true, read=true, update=true, delete=true` | Full CRUD: create/edit/delete, toggle actief-status, open edit modal |
| `editor`, `viewer`, `none` | read-only | View-only: list table only, no “Nieuwe abonnementsvorm” button, no edit modal, no delete/toggle actions |

- The `abonnementsvormen_beheerrecht` topic controls both UI availability (left menu, buttons) and backend API access (`/api/protected/abonnementsvormen`, `.../[id]`, `.../[id]/fietstypen`).
- `fietstypen` and `documenttemplates` supporting APIs now follow the original behavior: GETs are unrestricted (still require auth when an organization context is needed), and no longer depend on this topic.

### Module Access / Navigation
- Left menu (`LeftMenuGemeente`) shows “Abonnementsvormen” only when the user has rights for `abonnementsvormen_beheerrecht` **and** the active organization has the “abonnementen” module (mirroring ColdFusion behavior).  Internally this uses the modules_contacts data for the selected contact.
- Route guard (`/pages/beheer/[activecomponent]/[id].tsx`) also checks both the topic and the module flag before rendering the component; otherwise an access-denied message is shown.
- **ColdFusion reference:** in `system/customtags/layout/nav.cfm` the “Abonnementen” menu (which exposes `abonnementsvormen`) is visible only when:
  - `request.council.getID() eq "1"` (Fietsberaad admin) **or**
  - `request.council.hasModule("abonnementen")` **and** `session.user.hasRight("abonnementen")`.
  The same condition also controls the “Documenten” module link directly beneath it.
- The ColdFusion menu wraps subitems (Abonnementsvormen + Abonnementen) under the same conditional, so both disappear together if the organization lacks the “abonnementen” module. In our Next.js setup those items live at top-level, so the code now enforces the same module + rights check before showing either entry.
- If a municipality has the `buurtstallingen` module but **not** the `abonnementen` module, then:
  - The “Abonnementen” parent menu, its subitems (Abonnementsvormen list + Abonnementen list), and the “Documenten” menu are hidden entirely in the ColdFusion GUI.
  - The buurstal-specific form sections inside `abonnementsvormen/edit.cfm` (Contract/Machtiging/Voorwaarden) still exist but are unreachable unless the menu is visible.
  - The Next.js port replicates this by requiring both the security topic and the “abonnementen” module flag before showing any Abonnementsvormen UI.
- On the public (client-facing) ColdFusion site, abonnementsvormen are exposed via the “Abonnementen” pages: each bike park lists its available abonnementsvormen, and detail pages include price, duration, stallingstype, document requirements, etc. Visibility there is also conditioned by the organization’s module setup (no abonnementen module → no public abonnementsvorm overview). The current Next.js environment does **not** yet implement these public pages, so this behavior still lives only in the legacy ColdFusion front-end.

### UI Behavior
- Table action buttons (toggle, edit, delete) and the “Nieuwe abonnementsvorm” button are shown only when the user’s CRUD rights include the corresponding operation.
- The edit modal opens only when the user is allowed to create/edit; closing the modal doesn’t refresh data unless a successful save occurs.

### Backend Enforcement
- `GET /api/protected/abonnementsvormen` is open to authenticated users with an active contact.
- `/api/protected/abonnementsvormen/[id]` and `/api/protected/abonnementsvormen/[id]/fietstypen` check `abonnementsvormen_beheerrecht`:
  - `GET` (incl. `id="new"`) requires `read`.
  - `POST` requires `create`.
  - `PUT` requires `update`.
  - `DELETE` requires `delete`.
- Supporting APIs:
  - `/api/protected/fietstypen`: public GET (no organizational restriction).
  - `/api/protected/documenttemplates`: GET requires auth + active contact (needed to filter templates by `siteID`), but no security-topic gates; other methods remain unsupported.

### Client-Facing Display (New React Frontend)
- The map/parking detail view renders `ParkingViewAbonnementen` (see `src/components/parking/ParkingViewAbonnementen.tsx`).
- That component loads data through two hooks:
  - `useSubscriptionTypesForParking(parkingId)` → calls `/api/subscription_types_for_parking?parkingId=…` and returns all abonnementtypen linked to the stallings’ ID.
  - `useAbonnementLink(parkingId)` → calls `/api/protected/fietsenstallingen/abonnementlink/[parkingId]` which returns `{ status, url }` pointing to the ColdFusion checkout flow.
- The UI shows the abonnementen grid and “Koop abonnement” button **only if** all of the following are true:
  1. Both hooks finish successfully (no loading/error state).
  2. The link response has `status === true` and a non-empty `url`.
  3. There is at least one abonnementvorm whose `bikeparkTypeID` matches the current stallingtype (e.g. buurtstalling vs kluizen).
- If any check fails (no link, empty list, error), the component renders “Geen informatie over abonnementen beschikbaar”.
- This mirrors ColdFusion’s requirement that a stalling must actively publish abonnementen and have a valid verkoop URL; otherwise the section stays hidden.

### Document Templates (ColdFusion Behavior)
- **Only organization-specific templates are relevant**. There are currently no “Fietsberaad standard” templates; the modern implementation therefore omits the fallback section.
- Original ColdFusion logic:
  - Organization templates: `request.council.getDocumenttemplates()`
  - If configured, Fietsberaad templates would be appended with a “Standaarddocumenten” separator using `variables.fietsberaad.getDocumenttemplates()`.
  - Contract & Machtiging fields are shown only when:
    1. The council has the `buurtstallingen` module.
    2. The abonnementsvorm is new **or** its `bikeparkType` is `buurtstalling`/`fietstrommel`.
    3. The council (or Fietsberaad) has document templates.
  - Voorwaarden is shown whenever any document templates exist (not limited to buurtstallingen).
- Module flag impact:
  - `request.council.hasModule("buurtstallingen")` gates Contract/Machtiging entirely. If the module is disabled for the organization, those fields are hidden even if templates exist.
  - JS helpers in `edit.cfm` (`bikeparkTypeChanged`) toggle CSS classes `.showBuurtstalling` / `.hideBuurtstalling` so the UI reacts instantly to module/bikepark-type combinations.

### Summary
- `abonnementsvormen_beheerrecht` is the single source of truth for both menu visibility and API authorization.
- Root/Admin users manage abonnementsvormen end-to-end; Editors/Viewers have read-only visibility.
- Document templates pull only organization data; the legacy fallback is irrelevant because no standards exist today.

