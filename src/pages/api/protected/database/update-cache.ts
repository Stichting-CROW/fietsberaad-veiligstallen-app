import type { NextApiRequest, NextApiResponse } from "next";
import DatabaseService, { type CacheParams, type CacheStatus } from "~/backend/services/database-service";
import moment from "moment";
import { getTransactionCacheStatus } from "~/backend/services/database/TransactionsCacheActions";
import { getBezettingCacheStatus } from "~/backend/services/database/BezettingCacheActions";
import { getStallingsduurCacheStatus } from "~/backend/services/database/StallingsduurCacheActions";

export interface CacheUpdateLogEntry {
  date: Date;
  success: boolean;
  summaryText?: string;

  data: Record<"Transaction" | "Bezetting" | "Stallingsduur", {
      success: boolean;
      message: string;
      statusStart: CacheStatus | false;
      statusEnd: CacheStatus | false;
  }>;
}

const getBlankLogEntry = (): CacheUpdateLogEntry => { 
    return {
      date: new Date(),
      success: false,
      summaryText: "",
      data: {
        Transaction: {
          success: false,
          message: "Not updated",
          statusStart: false,
          statusEnd: false
        },
        Bezetting: {
          success: false,
          message: "Not updated",
          statusStart: false,
          statusEnd: false
        },
        Stallingsduur: {
          success: false,
          message: "Not updated",
          statusStart: false,
          statusEnd: false
        }
      }
    };
};

const formatLogEntry = (logEntry: CacheUpdateLogEntry, params: CacheParams): string => {
  // format the log entry as a text table that can be displayed in a note field

  // ' Date: 2025-08-11T00:00:00.000Z'
  // ' Cache has been updated for the date interval .....'

  // the update succeeded / the update failed with error message: 
  // Transaction cache: 'now has xxxx new entries with a date range from xxx to .....' or Failed: Error message
  // Bezetting cache: 'now has xxxx new entries with a date range from xxx to .....' or Failed: Error message
  // Stallingsduur cache: 'now has xxxx new entries with a date range from xxx to .....' or Failed: Error message

  const fmt = (d?: Date | null) => (d ? moment(d).format('YYYY-MM-DD') : 'unknown');
  const fmtStatus = (s?: CacheStatus | false) => {
    if (!s || s.status !== 'available') return { size: 'unknown', first: 'unknown', last: 'unknown' };
    return {
      size: s.size ?? 'unknown',
      first: fmt(s.firstUpdate ?? null),
      last: fmt(s.lastUpdate ?? null)
    };
  };

  const txnStart = logEntry.data.Transaction.statusStart;
  const txnEnd = logEntry.data.Transaction.statusEnd;
  const bezStart = logEntry.data.Bezetting.statusStart;
  const bezEnd = logEntry.data.Bezetting.statusEnd;
  const stdStart = logEntry.data.Stallingsduur.statusStart;
  const stdEnd = logEntry.data.Stallingsduur.statusEnd;

  const txn = fmtStatus(txnEnd);
  const bez = fmtStatus(bezEnd);
  const std = fmtStatus(stdEnd);

  const added = (end?: CacheStatus | false, start?: CacheStatus | false) => {
    const endSize = end && end.status === 'available' ? (end.size ?? 0) : undefined;
    const startSize = start && start.status === 'available' ? (start.size ?? 0) : undefined;
    if (typeof endSize === 'number' && typeof startSize === 'number') return Math.max(0, endSize - startSize);
    return 'unknown';
  };

  const txnAdded = added(txnEnd, txnStart);
  const bezAdded = added(bezEnd, bezStart);
  const stdAdded = added(stdEnd, stdStart);

  const result = `
  Date: ${logEntry.date.toISOString()}
  Cache has been updated for the date interval ${fmt(params.startDate)} to ${fmt(params.endDate)}
  Transaction cache: ${logEntry.data.Transaction.success ? `now has ${txn.size} total entries with a date range from ${txn.first} to ${txn.last} (${txnAdded} transactions added)` : `Failed: ${logEntry.data.Transaction.message}`}
  Bezetting cache: ${logEntry.data.Bezetting.success ? `now has ${bez.size} total entries with a date range from ${bez.first} to ${bez.last} (${bezAdded} transactions added)` : `Failed: ${logEntry.data.Bezetting.message}`}
  Stallingsduur cache: ${logEntry.data.Stallingsduur.success ? `now has ${std.size} total entries with a date range from ${std.first} to ${std.last} (${stdAdded} transactions added)` : `Failed: ${logEntry.data.Stallingsduur.message}`}
  `;

  return result;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const logEntry: CacheUpdateLogEntry = getBlankLogEntry();
  
  try {
    console.log("*** Update report caches started");
    
    // TODO: Uncomment when bearer token authentication is implemented
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   res.status(401).json({ error: "Bearer token required" });
    //   return;
    // }
    
    const { from } = req.query;

    // if to is not provided, set it to tomorrow
    let startDateParam = from;
    if (!startDateParam) {
      startDateParam = moment().toISOString();
      console.log("*** startDateParam", startDateParam);
    }
    
    if (!startDateParam) {
      res.status(400).json({ error: "'from' query parameter is required" });
      return;
    }
    
    // Parse the dates from ISO string format using moment
    const startMoment = moment(startDateParam as string);
    
    if (!startMoment.isValid()) {
      res.status(400).json({ error: "Invalid date format. Use ISO format (e.g., 2025-08-11Z)" });
      return;
    }
    
    // Create CacheParams object
    const params: CacheParams = {
      action: 'update',
      startDate: startMoment.toDate(),
      endDate: moment().add(1, 'day').toDate(), // tomorrow
      allDates: false,
      allBikeparks: true,
      selectedBikeparkIDs: []
    };

    console.log(`Updating cache tables for interval ${params.startDate} to ${params.endDate}`);

    try {
      console.log("*** Updating Transaction Cache");
      logEntry.data.Transaction.statusStart = await getTransactionCacheStatus(params);
      const transactionCacheResult = await DatabaseService.manageTransactionCache(params);
      logEntry.data.Transaction.success = transactionCacheResult.success;
      logEntry.data.Transaction.message = transactionCacheResult.message;
      logEntry.data.Transaction.statusEnd = transactionCacheResult.status || false;
    } catch (error) {
      console.error("*** Updating Transaction Cache error:", error);

      logEntry.data.Transaction.success = false;
      logEntry.data.Transaction.message = error instanceof Error ? error.message : "Unknown error";
      logEntry.data.Transaction.statusEnd = false;
    }

    try {
      console.log("*** Updating Bezetting Cache");
      logEntry.data.Bezetting.statusStart = await getBezettingCacheStatus(params);
      const bezettingCacheResult = await DatabaseService.manageBezettingCache(params);
      logEntry.data.Bezetting.success = bezettingCacheResult.success;
      logEntry.data.Bezetting.message = bezettingCacheResult.message;
      logEntry.data.Bezetting.statusEnd = bezettingCacheResult.status || false;
    } catch (error) {
      console.error("*** Updating Bezetting Cache error:", error);

      logEntry.data.Bezetting.success = false;
      logEntry.data.Bezetting.message = error instanceof Error ? error.message : "Unknown error";
      logEntry.data.Bezetting.statusEnd = false;
    }
    
    try {
      console.log("*** Updating Stallingsduur Cache");

      logEntry.data.Stallingsduur.statusStart = await getStallingsduurCacheStatus(params);
      const stallingsduurCacheResult = await DatabaseService.manageStallingsduurCache(params);
      logEntry.data.Stallingsduur.success = stallingsduurCacheResult.success;
      logEntry.data.Stallingsduur.message = stallingsduurCacheResult.message;
      logEntry.data.Stallingsduur.statusEnd = stallingsduurCacheResult.status || false;
    } catch (error) {
      console.error("*** Updating Stallingsduur Cache error:", error);

      logEntry.data.Stallingsduur.success = false;
      logEntry.data.Stallingsduur.message = error instanceof Error ? error.message : "Unknown error";
      logEntry.data.Stallingsduur.statusEnd = false;
    }
    
    logEntry.success = logEntry.data.Transaction.success && 
                       logEntry.data.Bezetting.success && 
                       logEntry.data.Stallingsduur.success;
    
    logEntry.summaryText = formatLogEntry(logEntry, params);
    console.log("*** Log entry:", logEntry.summaryText);

    const statusCode = logEntry.success ? 200 : 207; // 207 Multi-Status for partial failures
    res.status(statusCode).json({
      success: logEntry.success,
      logEntry: logEntry
    });
    
  } catch (error) {
    console.error("*** Update report caches error:", error);
    logEntry.success = false;
    logEntry.summaryText = error instanceof Error ? error.message : "Unknown error";
    logEntry.data.Transaction.success = false;
    logEntry.data.Bezetting.success = false;
    logEntry.data.Stallingsduur.success = false;
    
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      logEntry: logEntry
    });
  }
}
