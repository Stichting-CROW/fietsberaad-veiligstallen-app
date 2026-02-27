import { prisma } from "~/server/db";

export type FmsAuthResult =
  | { ok: true; urlName: string; permits: string[] }
  | { ok: false; status: 401 };

/**
 * Parse HTTP Basic Auth from request.
 * Returns { username, password } or null if no/invalid auth header.
 */
export function parseBasicAuth(authHeader: string | undefined): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith("Basic ")) return null;
  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      username: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  } catch {
    return null;
  }
}

/**
 * Validate FMS credentials against fmsservice_permit and contacts.
 * Returns permits for the given bikeparkID if valid.
 * Admin user (urlName = 'admin') has full access.
 */
export async function validateFmsAuth(
  username: string,
  password: string,
  bikeparkID?: string
): Promise<FmsAuthResult> {
  if (!username || !password) return { ok: false, status: 401 };

  if (username === "admin") {
    const adminContact = await prisma.contacts.findFirst({
      where: { UrlName: "admin", ItemType: "admin" },
    });
    if (adminContact?.Password === password) {
      return { ok: true, urlName: username, permits: ["operator", "admin"] };
    }
    return { ok: false, status: 401 };
  }

  const contact = await prisma.contacts.findFirst({
    where: {
      UrlName: username,
      Password: password,
      OR: [
        { ItemType: "dataprovider" },
        { ItemType: "organizations" },
      ],
    },
    select: { ID: true },
  });
  if (!contact) return { ok: false, status: 401 };

  const permits = await prisma.$queryRawUnsafe<
    { permit: string; bikeparkID: string | null }[]
  >(
    `SELECT p.Permit as permit, f.StallingsID as bikeparkID
     FROM fmsservice_permit p
     INNER JOIN fietsenstallingen f ON f.ID = p.BikeparkID
     WHERE p.OperatorID = ?
     AND LENGTH(COALESCE(p.Permit,'')) > 0
     AND p.BikeparkID IS NOT NULL
     UNION
     SELECT p.Permit as permit, f.StallingsID as bikeparkID
     FROM fmsservice_permit p
     INNER JOIN contacts gemeente ON p.SiteID = gemeente.ID
     INNER JOIN fietsenstallingen f ON f.SiteID = gemeente.ID
     WHERE p.OperatorID = ? AND p.BikeparkID IS NULL
     AND LENGTH(COALESCE(p.Permit,'')) > 0
     UNION
     SELECT 'operator' as permit, f.StallingsID as bikeparkID
     FROM contacts c
     INNER JOIN fietsenstallingen f ON f.SiteID = c.ID
     WHERE c.ID = ? AND LENGTH(COALESCE(c.Password,'')) > 0`,
    contact.ID,
    contact.ID,
    contact.ID
  );

  if (permits.length === 0) return { ok: false, status: 401 };

  const permitSet = new Set(permits.map((p) => p.permit));
  if (bikeparkID) {
    const hasAccess = permits.some(
      (p) => p.bikeparkID === bikeparkID || p.bikeparkID === null
    );
    if (!hasAccess) return { ok: false, status: 401 };
  }

  return {
    ok: true,
    urlName: username,
    permits: Array.from(permitSet),
  };
}

export function hasPermit(permits: string[], required: string): boolean {
  if (permits.includes("admin")) return true;
  return permits.some((p) => p.toLowerCase() === required.toLowerCase());
}
