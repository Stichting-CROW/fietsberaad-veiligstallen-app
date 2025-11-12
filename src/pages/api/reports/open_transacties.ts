import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

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
  const startTime = Date.now();
  console.log('[open_transacties] API call started at', new Date().toISOString());
  
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.log('[open_transacties] Authentication failed');
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    console.log('[open_transacties] Invalid method:', req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;
    console.log('[open_transacties] Processing request with settings:', {
      locationID: settings.locationID,
      year: settings.year,
      contactID: settings.contactID
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

    // Get parking location to validate it exists
    const parkingQueryStart = Date.now();
    const parking = await prisma.fietsenstallingen.findFirst({
      where: {
        StallingsID: settings.locationID
      }
    });
    console.log('[open_transacties] Parking query took', Date.now() - parkingQueryStart, 'ms');

    if (!parking) {
      console.log('[open_transacties] Parking location not found:', settings.locationID);
      res.status(404).json({ error: "Parking location not found" });
      return;
    }

    // Calculate date range for the year
    const yearStart = `${settings.year}-01-01`;
    const yearEnd = `${settings.year}-12-31 23:59:59`;
    
    // Build SQL query to get all raw transaction data
    const sqlQueryStart = Date.now();
    
    // Simple query to get all transactions for the location and year
    const sql = `
      SELECT 
        ta.locationid,
        ta.checkintype,
        ta.checkouttype,
        ta.checkindate,
        ta.checkoutdate
      FROM transacties_archief ta
      WHERE ta.locationid = '${settings.locationID}'
        AND ta.checkindate >= '${yearStart}'
        AND ta.checkindate < DATE_ADD('${yearStart}', INTERVAL 1 YEAR)
      ORDER BY ta.checkindate, ta.checkintype, ta.checkouttype
    `;

    // Write the SQL query to a file for external tool usage
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sql-query-open-transacties-${timestamp}.sql`;
      const logsDir = join(process.cwd(), 'logs');
      
      // Create logs directory if it doesn't exist
      await mkdir(logsDir, { recursive: true });
      
      const filepath = join(logsDir, filename);
      
      // Write SQL query to file with header comments
      const fileContent = `-- SQL Query for open transactions overview
-- Generated at: ${new Date().toISOString()}
-- Location ID: ${settings.locationID}
-- Year: ${settings.year}

${sql}
`;
      
      await writeFile(filepath, fileContent, 'utf-8');
      console.log(`[open_transacties] SQL query written to: ${filepath}`);
    } catch (fileError) {
      console.error('[open_transacties] Error writing SQL query to file:', fileError);
      // Fallback to console logging if file write fails
      console.log('\n========================================');
      console.log('[open_transacties] SQL Query');
      console.log('========================================');
      console.log(sql);
      console.log('========================================\n');
    }

    console.log('[open_transacties] Executing SQL query...');
    const rawResults = await prisma.$queryRawUnsafe<RawResult[]>(sql);
    console.log('[open_transacties] SQL query took', Date.now() - sqlQueryStart, 'ms');
    console.log('[open_transacties] Found', rawResults.length, 'transaction records');

    // Convert raw results to expected format
    const result: RawTransactionData[] = rawResults.map(row => ({
      locationid: row.locationid,
      checkintype: row.checkintype,
      checkouttype: row.checkouttype,
      checkindate: row.checkindate,
      checkoutdate: row.checkoutdate
    }));

    const totalTime = Date.now() - startTime;
    console.log('[open_transacties] API call completed in', totalTime, 'ms');

    res.status(200).json(result);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[open_transacties] Error in API call after', totalTime, 'ms:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

