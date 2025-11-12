import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";

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

