/**
 * HTTP Basic auth for the reporting REST API, ported from the ColdFusion
 * v1_reportingservice.cfc (checkRights / getLocationsForUser).
 *
 * Authenticates a security_users account (bcrypt) and resolves the gemeenten
 * (security_users_sites) the user has access to. Rootadmin users have full
 * access, mirroring the legacy `GetUserRoles() eq "admin"` check.
 */
import bcrypt from "bcryptjs";
import { prisma } from "~/server/db";

export { parseBasicAuth } from "~/server/services/fms/fms-auth";

export type ReportingAuthResult =
  | { ok: true; userId: string; isAdmin: boolean; siteIDs: string[] }
  | { ok: false };

/**
 * Validate reporting credentials against the security_users table.
 * Returns the user's admin flag and accessible gemeente siteIDs when valid.
 */
export async function validateReportingAuth(
  username: string,
  password: string
): Promise<ReportingAuthResult> {
  if (!username || !password) return { ok: false };

  const user = await prisma.security_users.findFirst({
    where: { UserName: username.toLowerCase() },
    select: {
      UserID: true,
      EncryptedPassword: true,
      security_users_sites: { select: { SiteID: true } },
      user_contact_roles: { select: { ContactID: true, NewRoleID: true } },
    },
  });

  if (!user || !user.EncryptedPassword) return { ok: false };

  const passwordOk = await bcrypt.compare(password, user.EncryptedPassword);
  if (!passwordOk) return { ok: false };

  const isAdmin = user.user_contact_roles.some(
    (role) => role.ContactID === "1" && role.NewRoleID === "rootadmin"
  );

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
