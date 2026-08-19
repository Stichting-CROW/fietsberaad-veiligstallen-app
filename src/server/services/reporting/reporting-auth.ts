/**
 * HTTP Basic auth for the reporting REST API.
 *
 * ColdFusion sources:
 *   - remote/Application.cfc  (reporting path): Basic Auth login
 *   - remote/REST/reporting/v1_reportingservice.cfc: checkRights / getLocationsForUser
 *
 * ── Credentials (unchanged from CF) ──────────────────────────────────────────
 *
 *   - security_users.UserName + EncryptedPassword2 (SHA-256 via helperclass.encrypt)
 *   - security_users.Status must be "1"
 *   - Special account: contacts.UrlName = "admin" (plaintext Password) → full access
 *
 * ── CF reporting login (Application.cfc) ───────────────────────────────────────
 *
 *   Allowed security_users.RoleID: 1, 2, 4, 5, 6, 8, 9, 10
 *   Excluded RoleID: 3 (InternEditor), 7 (Beheerder admin roles)
 *
 *   Global admin (GetUserRoles() eq "admin", all FMS locations):
 *     RoleID 1 (Root) or 2 (InternAdmin) — Fietsberaad intern users only
 *
 *   Scoped access (data-analyst):
 *     All other allowed RoleIDs; locations from linked organisations
 *
 * ── NewRoleID parity (user_contact_role on own organisation) ───────────────────
 *
 *   Uses NewRoleID + org kind (GroupID or own contact ItemType).
 *   Rules match convertNewRoleToOldRole() in securitycontext.ts, then CF allowlist.
 *
 *   Org kind            │ ItemType      │ GroupID
 *   ────────────────────┼───────────────┼───────────
 *   intern (Fietsberaad)│ admin         │ intern
 *   extern (gemeente)   │ organizations │ extern
 *   exploitant          │ exploitant    │ exploitant
 *   beheerder           │ (varies)      │ beheerder
 *
 *   NewRoleID   │ Org kind              │ CF RoleID │ Reporting API
 *   ────────────┼───────────────────────┼───────────┼────────────────────────────
 *   viewer      │ any                   │ 8/9/10    │ allowed, scoped
 *   rootadmin   │ intern                │ 1         │ allowed, global admin
 *   admin       │ intern                │ 2         │ allowed, global admin
 *   rootadmin   │ extern                │ 4         │ allowed, scoped
 *   admin       │ extern                │ 4         │ allowed, scoped
 *   rootadmin   │ exploitant            │ 6         │ allowed, scoped
 *   admin       │ exploitant            │ 6         │ allowed, scoped
 *   editor      │ extern                │ 5         │ allowed, scoped
 *   editor      │ exploitant/beheerder  │ 6         │ allowed, scoped
 *   rootadmin   │ beheerder             │ 7         │ denied
 *   admin       │ beheerder             │ 7         │ denied
 *   editor      │ intern                │ 3         │ denied
 *   none        │ any                   │ —         │ denied
 *
 *   Location scope: user_contact_role.ContactID for all linked organisations
 *   (same set synced to security_users_sites for legacy CF).
 *
 *   Per-location check (assertLocationRights): admin → all locations; otherwise
 *   bikepark SiteID must be in the user's linked ContactID set.
 */
import { prisma } from "~/server/db";
import { VSUserRoleValuesNew } from "~/types/users";
import { VSUserGroupValues } from "~/types/users-coldfusion";
import { verifyApiPassword } from "~/utils/server/password-tools";

export { parseBasicAuth } from "~/server/services/fms/fms-auth";

type ReportingOrgKind = "intern" | "extern" | "exploitant" | "beheerder";

export type ReportingAuthResult =
  | { ok: true; userId: string; isAdmin: boolean; siteIDs: string[] }
  | { ok: false };

function resolveOrgKind(
  groupID: string | null | undefined,
  contactItemType: string | null | undefined
): ReportingOrgKind | null {
  if (
    groupID === VSUserGroupValues.Intern ||
    groupID === VSUserGroupValues.Extern ||
    groupID === VSUserGroupValues.Exploitant ||
    groupID === VSUserGroupValues.Beheerder
  ) {
    return groupID;
  }
  switch (contactItemType) {
    case "admin":
      return "intern";
    case "organizations":
      return "extern";
    case "exploitant":
      return "exploitant";
    default:
      return null;
  }
}

/**
 * CF reporting login allowed RoleID IN (1,2,4,5,6,8,9,10), expressed via
 * NewRoleID on the user's own organisation (same mapping as convertNewRoleToOldRole).
 */
export function isReportingRoleAllowed(
  newRoleID: string | null | undefined,
  orgKind: ReportingOrgKind
): boolean {
  switch (newRoleID) {
    case VSUserRoleValuesNew.Viewer:
      return true;
    case VSUserRoleValuesNew.RootAdmin:
    case VSUserRoleValuesNew.Admin:
      return orgKind !== "beheerder";
    case VSUserRoleValuesNew.Editor:
      return orgKind !== "intern";
    default:
      return false;
  }
}

/** CF GetUserRoles() eq "admin": Fietsberaad intern rootadmin or admin only. */
export function isReportingAdminRole(
  newRoleID: string | null | undefined,
  orgKind: ReportingOrgKind
): boolean {
  if (orgKind !== "intern") return false;
  return (
    newRoleID === VSUserRoleValuesNew.RootAdmin ||
    newRoleID === VSUserRoleValuesNew.Admin
  );
}

/**
 * Validate reporting credentials against security_users (or the admin contact).
 * Returns the user's admin flag and accessible gemeente siteIDs when valid.
 */
export async function validateReportingAuth(
  username: string,
  password: string
): Promise<ReportingAuthResult> {
  if (!username || !password) return { ok: false };

  if (username === "admin") {
    const adminContact = await prisma.contacts.findFirst({
      where: { UrlName: "admin", ItemType: "admin" },
      select: { ID: true, Password: true },
    });
    if (adminContact?.Password === password) {
      return { ok: true, userId: adminContact.ID, isAdmin: true, siteIDs: [] };
    }
    return { ok: false };
  }

  const user = await prisma.security_users.findFirst({
    where: {
      UserName: username.toLowerCase(),
      Status: "1",
    },
    select: {
      UserID: true,
      GroupID: true,
      EncryptedPassword2: true,
      user_contact_roles: {
        select: {
          ContactID: true,
          NewRoleID: true,
          isOwnOrganization: true,
        },
      },
    },
  });

  if (!user || !verifyApiPassword(password, user.EncryptedPassword2)) {
    return { ok: false };
  }

  const ownRole = user.user_contact_roles.find((role) => role.isOwnOrganization);
  if (!ownRole?.ContactID) return { ok: false };

  const ownContact = await prisma.contacts.findFirst({
    where: { ID: ownRole.ContactID },
    select: { ItemType: true },
  });

  const orgKind = resolveOrgKind(user.GroupID, ownContact?.ItemType);
  if (!orgKind || !isReportingRoleAllowed(ownRole.NewRoleID, orgKind)) {
    return { ok: false };
  }

  const isAdmin = isReportingAdminRole(ownRole.NewRoleID, orgKind);

  const siteIDs = user.user_contact_roles
    .map((role) => role.ContactID)
    .filter((id): id is string => !!id && id !== "0");

  return { ok: true, userId: user.UserID, isAdmin, siteIDs };
}

/**
 * Port of checkRights(bikepark=...): the user is allowed when they are an
 * admin, or when the bikepark's gemeente (SiteID) is in their accessible sites.
 * Returns true when authorized.
 */
export async function assertLocationRights(
  auth: Extract<ReportingAuthResult, { ok: true }>,
  locationid: string
): Promise<boolean> {
  if (auth.isAdmin) return true;

  const location = await prisma.fietsenstallingen.findFirst({
    where: { StallingsID: locationid },
    select: { SiteID: true },
  });

  if (!location?.SiteID) return false;

  return auth.siteIDs.includes(location.SiteID);
}
