import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import { validateUserSession } from "~/utils/server/database-tools";
import type { ControleSummaryResponse, ControleSummary } from "~/types/sync-summary";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ControleSummaryResponse | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check rapportages access rights
  const hasAccess = userHasRight(session.user.securityProfile, VSSecurityTopic.rapportages);
  if (!hasAccess) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    console.log("[controle-summary] Starting request");
    
    // Validate user session and get accessible sites
    const validation = await validateUserSession(session);
    if ("error" in validation) {
      console.log("[controle-summary] Validation error:", validation.error);
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites } = validation;
    console.log("[controle-summary] User accessible sites:", sites.length, sites.slice(0, 5));

    // Build WHERE clause for site filtering with proper escaping
    let siteFilter = "";
    
    if (sites.length > 0) {
      // Escape site IDs for SQL IN clause
      const escapedSites = sites.map(site => {
        // Escape single quotes and wrap in quotes
        return `'${String(site).replace(/'/g, "''")}'`;
      }).join(",");
      siteFilter = `AND f.SiteID IN (${escapedSites})`;
    }

    // Build SQL query (no pagination - returns all results)
    const sqlQuery = `
      SELECT 
        c.CompanyName, 
        f.Title, 
        f.Plaats, 
        MAX(ws.transactionDate) AS LaatsteSync
      FROM 
        contacts c 
        JOIN fietsenstallingen f ON (c.ID = f.SiteID)
        LEFT JOIN wachtrij_sync ws ON (ws.bikeparkID = f.StallingsID)
      WHERE 
        f.Status = '1'
        ${siteFilter}
      GROUP BY
        c.CompanyName, f.Title, f.Plaats
      HAVING
        MAX(ws.transactionDate) IS NOT NULL
      ORDER BY 
        c.CompanyName, f.Title, f.Plaats
    `;

    console.log("[controle-summary] Executing SQL query");

    // Execute query (returns all results)
    const rawResults = await prisma.$queryRawUnsafe<Array<{
      CompanyName: string | null;
      Title: string | null;
      Plaats: string | null;
      LaatsteSync: Date | null;
    }>>(sqlQuery);

    console.log("[controle-summary] Query results - rows:", rawResults.length);

    // Calculate age in days for each item
    const now = new Date();
    const data: ControleSummary[] = rawResults.map((row, index) => {
      const laatsteSync = row.LaatsteSync ? new Date(row.LaatsteSync) : null;
      let ageInDays: number | null = null;
      if (laatsteSync) {
        const diffTime = now.getTime() - laatsteSync.getTime();
        ageInDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        aggregationLevel: "fietsenstalling" as const,
        aggregationId: `${row.CompanyName || ''}-${row.Title || ''}-${index}`,
        aggregationName: row.Title || '',
        dataOwnerName: row.CompanyName,
        fietsenstallingName: row.Title || '',
        plaats: row.Plaats,
        laatsteSync,
        ageInDays,
        laatsteControle: null,
        controleAgeInDays: null,
        syncAgeInDays: null
      };
    });

    console.log("[controle-summary] Returning data:", {
      dataCount: data.length
    });
    if (data.length > 0 && data[0]) {
      console.log("[controle-summary] First data item sample:", {
        dataOwnerName: data[0].dataOwnerName,
        fietsenstallingName: data[0].fietsenstallingName,
        laatsteSync: data[0].laatsteSync
      });
    }

    return res.status(200).json({
      data
    });
  } catch (error) {
    console.error("Error fetching controle summary:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
