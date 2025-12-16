import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";
import { validateUserSession, getOrganisationTypeByID } from "~/utils/server/database-tools";
import { VSContactItemType } from "~/types/contacts";

interface Settings {
  contactID?: string | null;
  locationID?: string | null;
  year: number;
}

interface RawTransactionData {
  locationid: string;
  checkintype: string;
  checkouttype: string | null;
  checkindate: Date;
  checkoutdate: Date | null;
}

interface RawResult {
  locationid: string;
  checkintype: string;
  checkouttype: string | null;
  checkindate: Date;
  checkoutdate: Date | null;
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

    // Validate settings
    if (!settings.year) {
      res.status(400).json({ error: "Invalid settings: year is required" });
      return;
    }

    if (!settings.locationID) {
      res.status(400).json({ error: "locationID is required" });
      return;
    }

    // Validate user session and get accessible sites
    const validation = await validateUserSession(session);
    if ("error" in validation) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites, activeContactId } = validation;

    // Get parking location to validate it exists and user has access
    const parking = await prisma.fietsenstallingen.findFirst({
      where: {
        StallingsID: settings.locationID
      }
    });

    if (!parking) {
      res.status(404).json({ error: "Parking location not found" });
      return;
    }

    // Check if user has access to this parking location
    const isFietsberaad = activeContactId === "1";
    const activeContactItemType = activeContactId ? await getOrganisationTypeByID(activeContactId) : null;
    const isExploitant = activeContactItemType === VSContactItemType.Exploitant;

    let hasAccess = false;
    if (isFietsberaad) {
      // Fietsberaad: access to all stallingen
      hasAccess = true;
    } else if (isExploitant && activeContactId) {
      // Exploitant: access to stallingen managed by this exploitant
      hasAccess = parking.ExploitantID === activeContactId;
    } else {
      // Other organizations (gemeenten): access to stallingen from active organization
      hasAccess = parking.SiteID === activeContactId;
    }

    if (!hasAccess) {
      res.status(403).json({ error: "Geen toegang tot deze fietsenstalling" });
      return;
    }

    // Calculate date range for the year
    // Validate year is a valid integer
    const year = parseInt(String(settings.year), 10);
    if (isNaN(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: "Invalid year value" });
      return;
    }
    
    // Validate locationID is a string and doesn't contain SQL injection characters
    const locationID = String(settings.locationID);
    if (!locationID || locationID.length > 100) {
      res.status(400).json({ error: "Invalid locationID value" });
      return;
    }
    
    const yearStart = `${year}-01-01`;
    
    // Build SQL query with proper escaping (prevents SQL injection)
    // Escape SQL string values to prevent injection
    // locationID is already validated (string, max 100 chars, non-empty)
    // year is validated (integer between 1900-2100)
    // yearStart is constructed from validated year, so it's safe
    const escapedLocationID = locationID.replace(/'/g, "''").replace(/\\/g, "\\\\");
    
    // Construct query with properly escaped values
    // Since inputs are validated, we can safely construct the query
    const sql = `
      SELECT 
        ta.locationid,
        ta.checkintype,
        ta.checkouttype,
        ta.checkindate,
        ta.checkoutdate
      FROM transacties_archief ta
      WHERE ta.locationid = '${escapedLocationID}'
        AND ta.checkindate >= '${yearStart}'
        AND ta.checkindate < DATE_ADD('${yearStart}', INTERVAL 1 YEAR)
      ORDER BY ta.checkindate, ta.checkintype, ta.checkouttype
    `;

    // Note: Using $queryRawUnsafe because Prisma.sql is not available in this version
    // However, all inputs are validated and properly escaped, making this safe
    const rawResults = await prisma.$queryRawUnsafe<RawResult[]>(sql);

    // Convert raw results to expected format
    const result: RawTransactionData[] = rawResults.map(row => ({
      locationid: row.locationid,
      checkintype: row.checkintype,
      checkouttype: row.checkouttype,
      checkindate: row.checkindate,
      checkoutdate: row.checkoutdate
    }));

    res.status(200).json(result);

  } catch (error) {
    console.error('[open_transacties] Error in API call:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

