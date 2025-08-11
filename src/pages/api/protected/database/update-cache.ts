import type { NextApiRequest, NextApiResponse } from "next";
import DatabaseService, { type CacheParams } from "~/backend/services/database-service";
import moment from "moment";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    console.log("*** Update report caches started");
    
    // TODO: Uncomment when bearer token authentication is implemented
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   res.status(401).json({ error: "Bearer token required" });
    //   return;
    // }
    
    const { from, to } = req.query;

    // if to is not provided, set it to tomorrow
    let endDateParam = to;
    if (!endDateParam) {
      const tomorrow = moment().add(1, 'day');
      endDateParam = tomorrow.toISOString();
      console.log("*** tomorrowISO", endDateParam);
    }
    
    if (!from || !endDateParam) {
      res.status(400).json({ error: "Both 'from' and 'to' query parameters are required" });
      return;
    }
    
    // Parse the dates from ISO string format using moment
    const startMoment = moment(from as string);
    const endMoment = moment(endDateParam as string);
    
    if (!startMoment.isValid() || !endMoment.isValid()) {
      res.status(400).json({ error: "Invalid date format. Use ISO format (e.g., 2025-08-11Z)" });
      return;
    }
    
    const startDate = startMoment.toDate();
    const endDate = endMoment.toDate();
    
    // Create CacheParams object
    const params: CacheParams = {
      action: 'update',
      startDate: startDate,
      endDate: endDate,
      allDates: false,
      allBikeparks: true,
      selectedBikeparkIDs: []
    };
    
    console.log("*** Updating cache tables with params:", params);

    // simulate executing the cache update
    console.log("*** Simulating cache update", JSON.stringify(params, null, 2));
    return res.status(200).json({
      success: true,
      transactionCacheResult: { success: true },
      bezettingCacheResult: { success: true },
      stallingsduurCacheResult: { success: true }
    });
    
    // Call all three cache management methods
    const transactionCacheResult = await DatabaseService.manageTransactionCache(params);
    const bezettingCacheResult = await DatabaseService.manageBezettingCache(params);
    const stallingsduurCacheResult = await DatabaseService.manageStallingsduurCache(params);
    
    // Check if all operations were successful
    const allSuccessful = transactionCacheResult.success && 
                         bezettingCacheResult.success && 
                         stallingsduurCacheResult.success;
    
    console.log("*** Update report caches completed");
    
    res.status(200).json({
      success: allSuccessful,
      transactionCacheResult: transactionCacheResult,
      bezettingCacheResult: bezettingCacheResult,
      stallingsduurCacheResult: stallingsduurCacheResult
    });
    
  } catch (error) {
    console.error("*** Update report caches error:", error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      transactionCacheResult: null,
      bezettingCacheResult: null,
      stallingsduurCacheResult: null
    });
  }
}
