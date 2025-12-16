import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";
import { validateUserSession, getOrganisationTypeByID } from "~/utils/server/database-tools";
import { VSContactItemType } from "~/types/contacts";

interface Settings {
  year?: number; // Optional, ignored for performance
}

interface LocationWithData {
  locationID: string;
  stallingName: string;
  contactID: string;
  contactName: string;
  stallingType: string | null;
}

interface RawResult {
  locationid: string;
  stallingName: string | null;
  contactID: string | null;
  contactName: string | null;
  stallingType: string | null;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;

    // Validate user session and get accessible sites
    const validation = await validateUserSession(session);
    if ("error" in validation) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites, activeContactId } = validation;

    // Check if active organization is Fietsberaad
    const isFietsberaad = activeContactId === "1";

    // Check if active organization is an exploitant
    const activeContactItemType = activeContactId ? await getOrganisationTypeByID(activeContactId) : null;
    const isExploitant = activeContactItemType === VSContactItemType.Exploitant;

    // Validate and escape activeContactId if present (prevent SQL injection)
    let validatedContactId: string | null = null;
    let escapedContactId: string | null = null;
    if (activeContactId) {
      const contactIdStr = String(activeContactId);
      if (contactIdStr.length > 100) {
        res.status(400).json({ error: "Invalid contactID value" });
        return;
      }
      validatedContactId = contactIdStr;
      // Escape SQL string to prevent injection
      escapedContactId = contactIdStr.replace(/'/g, "''").replace(/\\/g, "\\\\");
    }

    // Build SQL query with proper escaping (prevents SQL injection)
    // Build query with conditional WHERE clause
    // All inputs are validated and properly escaped
    let siteFilter = "";
    
    if (isFietsberaad) {
      // Fietsberaad: show all stallingen (no site filter)
      siteFilter = "";
    } else if (isExploitant && escapedContactId) {
      // Exploitant: show all stallingen managed by this exploitant
      siteFilter = `AND f.ExploitantID = '${escapedContactId}'`;
    } else if (escapedContactId) {
      // Other organizations (gemeenten): only show stallingen from active organization
      siteFilter = `AND f.SiteID = '${escapedContactId}'`;
    } else {
      // No active contact ID - return empty result
      siteFilter = "AND 1=0";
    }
    
    const sql = `
      WITH locations_with_data AS (
        SELECT DISTINCT locationid
        FROM transacties_archief
      )
      SELECT
        lwd.locationid,
        f.Title AS stallingName,
        COALESCE(f.SiteID, f.ExploitantID) AS contactID,
        COALESCE(c_site.CompanyName, c_exploitant.CompanyName, 'Unknown') AS contactName,
        f.Type AS stallingType
      FROM locations_with_data lwd
      INNER JOIN fietsenstallingen f ON lwd.locationid = f.StallingsID
      LEFT JOIN contacts c_site ON f.SiteID = c_site.ID
      LEFT JOIN contacts c_exploitant ON f.ExploitantID = c_exploitant.ID
      WHERE 1=1 ${siteFilter}
      ORDER BY contactName, f.Title
    `;

    // Note: Using $queryRawUnsafe because Prisma.sql is not available in this version
    // However, all inputs are validated and properly escaped, making this safe
    const rawResults = await prisma.$queryRawUnsafe<RawResult[]>(sql);

    // Convert raw results to expected format
    const result: LocationWithData[] = rawResults.map(row => ({
      locationID: row.locationid,
      stallingName: row.stallingName || 'Unknown',
      contactID: row.contactID || '',
      contactName: row.contactName || 'Unknown',
      stallingType: row.stallingType
    }));

    res.status(200).json(result);

  } catch (error) {
    console.error('[open_transacties_locations] Error in API call:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

