import type { NextApiRequest, NextApiResponse } from "next";
import { validateBearerToken } from "~/utils/bearer-token-tools";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import {
  InvalidCacheDateError,
  updateReportCaches,
} from "~/backend/services/reports/updateReportCaches";

export type { CacheUpdateLogEntry } from "~/backend/services/reports/updateReportCaches";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    console.log("*** Update report caches started");
    
    // Authentication: Check for bearer token OR session with superadmin rights
    const authHeader = req.headers.authorization;
    const hasBearerToken = authHeader?.startsWith('Bearer ') && 
      validateBearerToken(authHeader.substring(7));
    
    const session = await getServerSession(req, res, authOptions);
    const hasSession = session?.user && 
      userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
    
    if (!hasBearerToken && !hasSession) {
      console.error("*** Update report caches - unauthorized access attempt");
      res.status(401).json({ 
        error: "Bearer token or authenticated session with superadmin rights required" 
      });
      return;
    }
    
    // Log which authentication method was used (without logging tokens)
    if (hasBearerToken) {
      console.log("*** Update report caches - authenticated via bearer token");
    } else if (hasSession) {
      console.log(`*** Update report caches - authenticated via session (user: ${session.user.id})`);
    }
    
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const logEntry = await updateReportCaches(from);

    const statusCode = logEntry.success ? 200 : 207; // 207 Multi-Status for partial failures
    res.status(statusCode).json({
      success: logEntry.success,
      logEntry: logEntry
    });
    
  } catch (error) {
    if (error instanceof InvalidCacheDateError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("*** Update report caches error:", error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
