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
  const startTime = Date.now();
  console.log('[open_transacties_locations] API call started at', new Date().toISOString());
  
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.log('[open_transacties_locations] Authentication failed');
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    console.log('[open_transacties_locations] Invalid method:', req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;
    console.log('[open_transacties_locations] Processing request (year parameter ignored for performance)');

    // Validate user session and get accessible sites
    const validation = await validateUserSession(session);
    if ("error" in validation) {
      console.log('[open_transacties_locations] Validation error:', validation.error);
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites, activeContactId } = validation;
    console.log('[open_transacties_locations] User accessible sites:', sites.length, sites.slice(0, 5));
    console.log('[open_transacties_locations] Active contact ID:', activeContactId);

    // Check if active organization is Fietsberaad
    const isFietsberaad = activeContactId === "1";

    // Check if active organization is an exploitant
    const activeContactItemType = activeContactId ? await getOrganisationTypeByID(activeContactId) : null;
    const isExploitant = activeContactItemType === VSContactItemType.Exploitant;

    // Build WHERE clause for site filtering with proper escaping
    let siteFilter = "";
    
    if (isFietsberaad) {
      // Fietsberaad: show all stallingen (no site filter)
      siteFilter = "";
    } else if (isExploitant && activeContactId) {
      // Exploitant: show all stallingen managed by this exploitant
      const escapedExploitant = `'${String(activeContactId).replace(/'/g, "''")}'`;
      siteFilter = `AND f.ExploitantID = ${escapedExploitant}`;
    } else {
      // Other organizations (gemeenten): only show stallingen from active organization
      if (activeContactId) {
        const escapedSite = `'${String(activeContactId).replace(/'/g, "''")}'`;
        siteFilter = `AND f.SiteID = ${escapedSite}`;
      }
    }

    // Build SQL query to get distinct locations with data (ignoring year for speed)
    const sqlQueryStart = Date.now();
    
    // First, get unique stallingIDs from transacties_archief (all years for speed)
    // Then join with fietsenstallingen to get full details
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

    console.log('[open_transacties_locations] Executing SQL query...');
    const rawResults = await prisma.$queryRawUnsafe<RawResult[]>(sql);
    console.log('[open_transacties_locations] SQL query took', Date.now() - sqlQueryStart, 'ms');
    console.log('[open_transacties_locations] Found', rawResults.length, 'locations with data');

    // Convert raw results to expected format
    const result: LocationWithData[] = rawResults.map(row => ({
      locationID: row.locationid,
      stallingName: row.stallingName || 'Unknown',
      contactID: row.contactID || '',
      contactName: row.contactName || 'Unknown',
      stallingType: row.stallingType
    }));

    const totalTime = Date.now() - startTime;
    console.log('[open_transacties_locations] API call completed in', totalTime, 'ms');

    res.status(200).json(result);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[open_transacties_locations] Error in API call after', totalTime, 'ms:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

