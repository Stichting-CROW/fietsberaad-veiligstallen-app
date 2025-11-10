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
  intervalDurations: number[];
  section?: 'overview' | 'parkeerduur';
}

interface TransactionIntervalData {
  date: string;
  startTime: string;
  transactionsStarted: number;
  transactionsClosed: number;
  openTransactionsAtStart: number;
  openTransactionsByDuration?: {
    duration_leq_1h: number;
    duration_1_3h: number;
    duration_3_6h: number;
    duration_6_9h: number;
    duration_9_13h: number;
    duration_13_18h: number;
    duration_18_24h: number;
    duration_24_36h: number;
    duration_36_48h: number;
    duration_48h_1w: number;
    duration_1w_2w: number;
    duration_2w_3w: number;
    duration_gt_3w: number;
  };
}

interface OpenTransactionDuration {
  date: string;
  startTime: string;
  durationHours: number;
}

interface RawIntervalResult {
  date: string;
  startTime: string;
  transactionsStarted: bigint;
  transactionsClosed: bigint;
  openTransactionsAtStart: bigint;
}

// Calculate interval start times for a day starting at 00:00:00
function calculateIntervalStartTimes(dayStart: Date, intervalDurations: number[]): Date[] {
  const startTimes: Date[] = [];
  let currentTime = new Date(dayStart);
  currentTime.setHours(0, 0, 0, 0); // Always start at midnight
  
  for (const duration of intervalDurations) {
    startTimes.push(new Date(currentTime));
    currentTime = new Date(currentTime.getTime() + duration * 60 * 60 * 1000);
  }
  
  return startTimes;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  console.log('[transacties_voltooid] API call started at', new Date().toISOString());
  
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.log('[transacties_voltooid] Authentication failed');
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    console.log('[transacties_voltooid] Invalid method:', req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;
    console.log('[transacties_voltooid] Processing request with settings:', {
      locationID: settings.locationID,
      year: settings.year,
      intervalDurations: settings.intervalDurations,
      contactID: settings.contactID
    });

    // Validate settings
    if (!settings.year || !settings.intervalDurations || !Array.isArray(settings.intervalDurations)) {
      res.status(400).json({ error: "Invalid settings: year and intervalDurations are required" });
      return;
    }

    // Validate intervalDurations sum to 24 hours
    const totalHours = settings.intervalDurations.reduce((sum, hours) => sum + hours, 0);
    if (totalHours !== 24) {
      res.status(400).json({ error: "intervalDurations must sum to 24 hours" });
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
    console.log('[transacties_voltooid] Parking query took', Date.now() - parkingQueryStart, 'ms');

    if (!parking) {
      console.log('[transacties_voltooid] Parking location not found:', settings.locationID);
      res.status(404).json({ error: "Parking location not found" });
      return;
    }

    // Calculate number of days in the year (handle leap years)
    const isLeapYear = (settings.year % 4 === 0 && settings.year % 100 !== 0) || (settings.year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;

    // Generate all interval start/end times for the year
    const intervalList: Array<{ date: string; startTime: string; startDateTime: string; endDateTime: string }> = [];
    
    for (let day = 0; day < daysInYear; day++) {
      const currentDate = new Date(settings.year, 0, 1);
      currentDate.setDate(currentDate.getDate() + day);
      
      // Always start intervals at 00:00:00 (midnight)
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      
      const intervalStartTimes = calculateIntervalStartTimes(dayStart, settings.intervalDurations);
      
      for (let i = 0; i < intervalStartTimes.length; i++) {
        const intervalStart = intervalStartTimes[i];
        const intervalDuration = settings.intervalDurations[i];
        if (!intervalStart || intervalDuration === undefined) continue;
        
        const intervalEnd = i < intervalStartTimes.length - 1 
          ? intervalStartTimes[i + 1]
          : new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000);
        
        if (!intervalEnd) continue;
        
        const dateStr = currentDate.toISOString().split('T')[0] || '';
        const timeStr = `${String(intervalStart.getHours()).padStart(2, '0')}:${String(intervalStart.getMinutes()).padStart(2, '0')}`;
        const startDateTime = intervalStart.toISOString().slice(0, 19).replace('T', ' ') || '';
        const endDateTime = intervalEnd.toISOString().slice(0, 19).replace('T', ' ') || '';
        
        intervalList.push({
          date: dateStr,
          startTime: timeStr,
          startDateTime,
          endDateTime
        });
      }
    }

    console.log('[transacties_voltooid] Generated', intervalList.length, 'intervals');

    // Build SQL query to aggregate data for all intervals
    const sqlQueryStart = Date.now();

    // Build UNION ALL for interval values
    const intervalValues = intervalList.map((interval, idx) => 
      `SELECT '${interval.date}' AS interval_date, '${interval.startTime}' AS interval_start_time, '${interval.startDateTime}' AS interval_start, '${interval.endDateTime}' AS interval_end`
    ).join(' UNION ALL ');

    const includeDurationBuckets = settings.section === 'parkeerduur';
    
    const sql = `
      WITH intervals AS (
        ${intervalValues}
      ),
      transactions_started AS (
        SELECT 
          i.interval_date AS date,
          i.interval_start_time AS startTime,
          COUNT(*) AS transactionsStarted
        FROM intervals i
        INNER JOIN transacties_archief ta ON 
          ta.locationid = '${settings.locationID}'
          AND ta.checkindate >= i.interval_start
          AND ta.checkindate < i.interval_end
        GROUP BY i.interval_date, i.interval_start_time
      ),
      transactions_open AS (
        SELECT 
          i.interval_date AS date,
          i.interval_start_time AS startTime,
          COUNT(*) AS openTransactionsAtStart
        FROM intervals i
        INNER JOIN transacties_archief ta ON 
          ta.locationid = '${settings.locationID}'
          AND ta.checkindate < i.interval_start
          AND (ta.checkoutdate IS NULL OR ta.checkoutdate >= i.interval_start)
        GROUP BY i.interval_date, i.interval_start_time
      ),
      transactions_open_by_duration AS (
        SELECT 
          i.interval_date AS date,
          i.interval_start_time AS startTime,
          TIMESTAMPDIFF(HOUR, ta.checkindate, i.interval_start) AS durationHours
        FROM intervals i
        INNER JOIN transacties_archief ta ON 
          ta.locationid = '${settings.locationID}'
          AND ta.checkindate < i.interval_start
          AND (ta.checkoutdate IS NULL OR ta.checkoutdate >= i.interval_start)
      ),
      transactions_ended AS (
        SELECT 
          i.interval_date AS date,
          i.interval_start_time AS startTime,
          COUNT(*) AS transactionsClosed
        FROM intervals i
        INNER JOIN transacties_archief ta ON 
          ta.locationid = '${settings.locationID}'
          AND ta.checkoutdate IS NOT NULL
          AND ta.checkoutdate >= i.interval_start
          AND ta.checkoutdate < i.interval_end
        GROUP BY i.interval_date, i.interval_start_time
      )
      SELECT 
        i.interval_date AS date,
        i.interval_start_time AS startTime,
        COALESCE(ts.transactionsStarted, 0) AS transactionsStarted,
        COALESCE(te.transactionsClosed, 0) AS transactionsClosed,
        COALESCE(to_count.openTransactionsAtStart, 0) AS openTransactionsAtStart
      FROM intervals i
      LEFT JOIN transactions_started ts ON 
        i.interval_date = ts.date 
        AND i.interval_start_time = ts.startTime
      LEFT JOIN transactions_open to_count ON 
        i.interval_date = to_count.date 
        AND i.interval_start_time = to_count.startTime
      LEFT JOIN transactions_ended te ON 
        i.interval_date = te.date 
        AND i.interval_start_time = te.startTime
      ORDER BY i.interval_date, i.interval_start_time
    `;

    // Write the SQL query to a file for external tool usage
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const section = settings.section || 'overview';
      const filename = `sql-query-${section}-${timestamp}.sql`;
      const logsDir = join(process.cwd(), 'logs');
      
      // Create logs directory if it doesn't exist
      await mkdir(logsDir, { recursive: true });
      
      const filepath = join(logsDir, filename);
      
      // Write SQL query to file with header comments
      const fileContent = `-- SQL Query for section: ${section}
-- Generated at: ${new Date().toISOString()}
-- Location ID: ${settings.locationID}
-- Year: ${settings.year}
-- Interval Durations: [${settings.intervalDurations.join(', ')}]

${sql}
`;
      
      await writeFile(filepath, fileContent, 'utf-8');
      console.log(`[transacties_voltooid] SQL query written to: ${filepath}`);
    } catch (fileError) {
      console.error('[transacties_voltooid] Error writing SQL query to file:', fileError);
      // Fallback to console logging if file write fails
      console.log('\n========================================');
      console.log(`[transacties_voltooid] SQL Query for section: ${settings.section || 'overview'}`);
      console.log('========================================');
      console.log(sql);
      console.log('========================================\n');
    }

    console.log('[transacties_voltooid] Executing SQL query...');
    const rawResults = await prisma.$queryRawUnsafe<RawIntervalResult[]>(sql);
    console.log('[transacties_voltooid] SQL query took', Date.now() - sqlQueryStart, 'ms');
    console.log('[transacties_voltooid] Found', rawResults.length, 'intervals');

    // Fetch duration data separately if needed
    let durationData: OpenTransactionDuration[] = [];
    if (includeDurationBuckets) {
      const durationQueryStart = Date.now();
      const durationSql = `
        SELECT 
          i.interval_date AS date,
          i.interval_start_time AS startTime,
          TIMESTAMPDIFF(HOUR, ta.checkindate, i.interval_start) AS durationHours
        FROM (
          ${intervalValues}
        ) AS intervals i
        INNER JOIN transacties_archief ta ON 
          ta.locationid = '${settings.locationID}'
          AND ta.checkindate < i.interval_start
          AND (ta.checkoutdate IS NULL OR ta.checkoutdate >= i.interval_start)
        ORDER BY i.interval_date, i.interval_start_time, durationHours
      `;
      
      // Write duration SQL query to file
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `sql-query-durations-${timestamp}.sql`;
        const logsDir = join(process.cwd(), 'logs');
        
        await mkdir(logsDir, { recursive: true });
        const filepath = join(logsDir, filename);
        
        const fileContent = `-- SQL Query for duration data (parkeerduur section)
-- Generated at: ${new Date().toISOString()}
-- Location ID: ${settings.locationID}
-- Year: ${settings.year}
-- Interval Durations: [${settings.intervalDurations.join(', ')}]

${durationSql}
`;
        
        await writeFile(filepath, fileContent, 'utf-8');
        console.log(`[transacties_voltooid] Duration SQL query written to: ${filepath}`);
      } catch (fileError) {
        console.error('[transacties_voltooid] Error writing duration SQL query to file:', fileError);
      }
      
      console.log('[transacties_voltooid] Fetching duration data...');
      const rawDurationResults = await prisma.$queryRawUnsafe<Array<{ date: string; startTime: string; durationHours: bigint }>>(durationSql);
      durationData = rawDurationResults.map(row => ({
        date: row.date,
        startTime: row.startTime,
        durationHours: Number(row.durationHours)
      }));
      console.log('[transacties_voltooid] Duration query took', Date.now() - durationQueryStart, 'ms');
      console.log('[transacties_voltooid] Found', durationData.length, 'open transactions with duration');
    }

    // Convert raw results to expected format
    const result: TransactionIntervalData[] = rawResults.map(row => ({
      date: row.date,
      startTime: row.startTime,
      transactionsStarted: Number(row.transactionsStarted),
      transactionsClosed: Number(row.transactionsClosed),
      openTransactionsAtStart: Number(row.openTransactionsAtStart)
    }));

    // Add duration data to response if needed
    if (includeDurationBuckets) {
      res.status(200).json({ intervals: result, durations: durationData });
    } else {
      res.status(200).json(result);
    }

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[transacties_voltooid] Error in API call after', totalTime, 'ms:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}
