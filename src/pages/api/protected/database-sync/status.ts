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
  if (req.method !== 'GET') {
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
    
    // Check if database URLs are configured
    const dbConfigured = syncService.isAvailable();
    
    if (!dbConfigured) {
      return res.json({
        available: false,
        message: 'Database sync is not configured. Please set DBSYNC_MASTER_URL and DBSYNC_TEST_URL environment variables.',
      });
    }

    // Check if pt-table-sync is installed
    const ptTableSyncCheck = await syncService.checkPtTableSyncInstalled();
    
    if (!ptTableSyncCheck.installed) {
      return res.json({
        available: false,
        ptTableSyncInstalled: false,
        message: 'pt-table-sync is not installed. Please install Percona Toolkit to use database sync.',
      });
    }

    const state = await syncService.getState();

    // Convert Map to object for JSON serialization
    const tablesArray = Array.from(state.tables.values());

    return res.json({
      available: true,
      ptTableSyncInstalled: true,
      isRunning: state.isRunning,
      isStopping: state.isStopping,
      startTime: state.startTime,
      currentTable: state.currentTable,
      totalTables: state.totalTables,
      completedTables: state.completedTables,
      tables: tablesArray,
      logs: state.logs.slice(-100), // Return last 100 log entries
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

