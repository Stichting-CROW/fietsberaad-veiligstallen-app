/**
 * HTTP Basic auth for the reporting REST API, ported from the ColdFusion
 * v1_reportingservice.cfc (checkRights / getLocationsForUser).
 *
 * Mirrors remote/Application.cfc reporting login:
 * - security_users with Status = 1, RoleID allowlist, EncryptedPassword2 (SHA-256)
 * - admin scope when RoleID is 1 or 2 (GetUserRoles() eq "admin")
 * - special contacts urlName = "admin" account with full access
 */
import { prisma } from "~/server/db";
import { verifyApiPassword } from "~/utils/server/password-tools";

export { parseBasicAuth } from "~/server/services/fms/fms-auth";

/** CF Application.cfc reporting login: RoleID IN (1,2,4,5,6,8,9,10). */
const REPORTING_ALLOWED_ROLE_IDS = [1, 2, 4, 5, 6, 8, 9, 10];

/** CF sets roles = "admin" when RoleID is 1 or 2. */
const REPORTING_ADMIN_ROLE_IDS = [1, 2];

export type ReportingAuthResult =
  | { ok: true; userId: string; isAdmin: boolean; siteIDs: string[] }
  | { ok: false };

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
      RoleID: { in: REPORTING_ALLOWED_ROLE_IDS },
    },
    select: {
      UserID: true,
      RoleID: true,
      EncryptedPassword2: true,
      security_users_sites: { select: { SiteID: true } },
    },
  });

  if (!user || !verifyApiPassword(password, user.EncryptedPassword2)) {
    return { ok: false };
  }

  const isAdmin =
    user.RoleID != null && REPORTING_ADMIN_ROLE_IDS.includes(user.RoleID);

  const siteIDs = user.security_users_sites
    .map((site) => site.SiteID)
    .filter((id): id is string => !!id);

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
