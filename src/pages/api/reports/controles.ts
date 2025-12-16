import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";
import { validateUserSession, getOrganisationTypeByID } from "~/utils/server/database-tools";
import { VSContactItemType } from "~/types/contacts";

interface Settings {
  locationID: string; // This is StallingsID
  year: number;
}

interface ControleRecord {
  checkindate: Date;
  locationid: string;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  console.log('[controles] API call started at', new Date().toISOString());
  
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.log('[controles] Authentication failed');
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    console.log('[controles] Invalid method:', req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;
    console.log('[controles] Processing request with settings:', {
      locationID: settings.locationID,
      year: settings.year
    });

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
      console.log("[controles] Validation error:", validation.error);
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites, activeContactId } = validation;
    console.log('[controles] User accessible sites:', sites.length, sites.slice(0, 5));
    console.log('[controles] Active contact ID:', activeContactId);

    // Get stalling to verify access and get StallingsID
    const stalling = await prisma.fietsenstallingen.findFirst({
      where: { StallingsID: settings.locationID },
      select: { ID: true, SiteID: true, ExploitantID: true, StallingsID: true }
    });

    if (!stalling) {
      return res.status(404).json({ error: "Stalling not found" });
    }

    // Check if user has access to this parking location (same logic as controle-summary)
    const isFietsberaad = activeContactId === "1";
    const activeContactItemType = activeContactId ? await getOrganisationTypeByID(activeContactId) : null;
    const isExploitant = activeContactItemType === VSContactItemType.Exploitant;

    let hasAccess = false;
    if (isFietsberaad) {
      // Fietsberaad: access to all stallingen
      hasAccess = true;
    } else if (isExploitant && activeContactId) {
      // Exploitant: access to stallingen managed by this exploitant
      hasAccess = stalling.ExploitantID === activeContactId;
    } else {
      // Other organizations (gemeenten): access to stallingen from active organization
      hasAccess = stalling.SiteID === activeContactId;
    }

    if (!hasAccess) {
      console.log('[controles] User does not have access to stalling:', settings.locationID);
      return res.status(403).json({ error: "Geen toegang tot deze fietsenstalling" });
    }

    // Calculate date range for the year
    const yearStart = new Date(`${settings.year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${settings.year}-12-31T23:59:59Z`);
    
    // Use the same data source as sync-events: wachtrij_sync table
    // This shows sync moments (which are called "controle" in the GUI)
    const sqlQueryStart = Date.now();
    
    const syncEvents = await prisma.wachtrij_sync.findMany({
      where: {
        bikeparkID: stalling.StallingsID || undefined,
        transactionDate: {
          gte: yearStart,
          lte: yearEnd
        }
      },
      select: {
        transactionDate: true
      },
      orderBy: {
        transactionDate: "asc"
      }
    });

    console.log('[controles] Query took', Date.now() - sqlQueryStart, 'ms');
    console.log('[controles] Found', syncEvents.length, 'sync events (controle records)');

    // Convert to expected format (same as before for compatibility)
    const result: ControleRecord[] = syncEvents
      .filter(event => event.transactionDate !== null)
      .map(event => ({
        checkindate: event.transactionDate!,
        locationid: settings.locationID
      }));

    const totalTime = Date.now() - startTime;
    console.log('[controles] API call completed in', totalTime, 'ms');

    res.status(200).json(result);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[controles] Error in API call after', totalTime, 'ms:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

