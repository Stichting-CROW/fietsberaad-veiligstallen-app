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
    console.log("[controle-overview] Starting request");
    
    // Validate user session and get accessible sites
    const validation = await validateUserSession(session);
    if ("error" in validation) {
      console.log("[controle-overview] Validation error:", validation.error);
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites } = validation;
    console.log("[controle-overview] User accessible sites:", sites.length, sites.slice(0, 5));

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

    // Build SQL query to get sync and controle dates from transacties_archief
    // Check both checkindate and checkoutdate for newest records
    // Use NULLIF to convert '1970-01-01' placeholder back to NULL
    const sqlQuery = `
      SELECT 
        c.CompanyName, 
        f.Title, 
        f.Plaats,
        NULLIF(GREATEST(
          COALESCE(MAX(CASE WHEN ta.checkintype = 'sync' THEN ta.checkindate END), '1970-01-01 00:00:00'),
          COALESCE(MAX(CASE WHEN ta.checkouttype = 'sync' THEN ta.checkoutdate END), '1970-01-01 00:00:00')
        ), '1970-01-01 00:00:00') AS LaatsteSync,
        NULLIF(GREATEST(
          COALESCE(MAX(CASE WHEN ta.checkintype = 'controle' THEN ta.checkindate END), '1970-01-01 00:00:00'),
          COALESCE(MAX(CASE WHEN ta.checkouttype = 'controle' THEN ta.checkoutdate END), '1970-01-01 00:00:00')
        ), '1970-01-01 00:00:00') AS LaatsteControle
      FROM 
        contacts c 
        JOIN fietsenstallingen f ON (c.ID = f.SiteID)
        LEFT JOIN transacties_archief ta ON (ta.locationid = f.StallingsID)
      WHERE 
        f.Status = '1'
        ${siteFilter}
      GROUP BY
        c.CompanyName, f.Title, f.Plaats
      HAVING
        NULLIF(GREATEST(
          COALESCE(MAX(CASE WHEN ta.checkintype = 'sync' THEN ta.checkindate END), '1970-01-01 00:00:00'),
          COALESCE(MAX(CASE WHEN ta.checkouttype = 'sync' THEN ta.checkoutdate END), '1970-01-01 00:00:00')
        ), '1970-01-01 00:00:00') IS NOT NULL
        OR NULLIF(GREATEST(
          COALESCE(MAX(CASE WHEN ta.checkintype = 'controle' THEN ta.checkindate END), '1970-01-01 00:00:00'),
          COALESCE(MAX(CASE WHEN ta.checkouttype = 'controle' THEN ta.checkoutdate END), '1970-01-01 00:00:00')
        ), '1970-01-01 00:00:00') IS NOT NULL
      ORDER BY 
        c.CompanyName, f.Title, f.Plaats
    `;

    console.log("[controle-overview] Executing SQL query");

    // Execute query (returns all results)
    const rawResults = await prisma.$queryRawUnsafe<Array<{
      CompanyName: string | null;
      Title: string | null;
      Plaats: string | null;
      LaatsteSync: Date | null;
      LaatsteControle: Date | null;
    }>>(sqlQuery);

    console.log("[controle-overview] Query results - rows:", rawResults.length);

    // Calculate age in days for each item
    const now = new Date();
    const data: ControleSummary[] = rawResults.map((row, index) => {
      const laatsteSync = row.LaatsteSync ? new Date(row.LaatsteSync) : null;
      const laatsteControle = row.LaatsteControle ? new Date(row.LaatsteControle) : null;
      
      let syncAgeInDays: number | null = null;
      if (laatsteSync) {
        const diffTime = now.getTime() - laatsteSync.getTime();
        syncAgeInDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      let controleAgeInDays: number | null = null;
      if (laatsteControle) {
        const diffTime = now.getTime() - laatsteControle.getTime();
        controleAgeInDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        aggregationLevel: "fietsenstalling" as const,
        aggregationId: `${row.CompanyName || ''}-${row.Title || ''}-${index}`,
        aggregationName: row.Title || '',
        dataOwnerName: row.CompanyName,
        fietsenstallingName: row.Title || '',
        plaats: row.Plaats,
        laatsteSync,
        ageInDays: syncAgeInDays,
        laatsteControle,
        controleAgeInDays,
        syncAgeInDays
      };
    });

    console.log("[controle-overview] Returning data:", {
      dataCount: data.length
    });
    if (data.length > 0 && data[0]) {
      console.log("[controle-overview] First data item sample:", {
        dataOwnerName: data[0].dataOwnerName,
        fietsenstallingName: data[0].fietsenstallingName,
        laatsteSync: data[0].laatsteSync,
        laatsteControle: data[0].laatsteControle
      });
    }

    return res.status(200).json({
      data
    });
  } catch (error) {
    console.error("Error fetching controle overview:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

