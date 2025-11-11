import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getSyncService } from "~/backend/services/database-sync-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
  }

  const hasDatabase = 
    userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_admin) ||
    userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  if (!hasDatabase) {
    return res.status(403).json({ error: "Access denied - insufficient permissions" });
  }

  try {
    const syncService = getSyncService();
    
    if (!syncService.isAvailable()) {
      return res.status(400).json({ 
        error: 'Database sync is not configured. Please set DBSYNC_MASTER_URL and DBSYNC_TEST_URL environment variables.' 
      });
    }

    // Get table list and dry run flag from request body
    const body = req.body || {};
    const tables: string[] | undefined = body.tables;
    const dryRun: boolean = body.dryRun !== undefined ? body.dryRun : true;

    if (tables && (!Array.isArray(tables) || tables.length === 0)) {
      return res.status(400).json({ 
        error: 'Invalid tables parameter. Must be a non-empty array of table names.' 
      });
    }
    
    // Start sync in background (don't await)
    syncService.startSync(tables, dryRun).catch(error => {
      console.error("Sync error:", error);
    });

    return res.json({ success: true, message: "Sync started" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error starting sync:", error);
    return res.status(500).json({ error: errorMessage });
  }
}

