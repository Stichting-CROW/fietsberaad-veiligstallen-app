import type { NextApiRequest, NextApiResponse } from "next";
import moment from "moment";
import { type CacheParams, type CacheStatus } from "~/backend/services/database-service"
import { clearTransactionCache, updateTransactionCache } from "~/backend/services/database/TransactionsCacheActions"

const cFirstDateToClear = "1/1/2018"
const cLastDateToClear = "1/1/2026"


const testTransactionCache = async (startDate: string, endDate: string, full: boolean) => {
  console.log("*** Processing for transaction cache - from", startDate, "to", endDate);

    const params: CacheParams = {
        action: 'clear',
        startDate: moment(cFirstDateToClear).toDate(),
        endDate: moment(cLastDateToClear).toDate(),
        selectedBikeparkIDs: [],
        allDates: true,
        allBikeparks: true
    }

    const status = await clearTransactionCache(params);
    console.log("*** Clear cache status:", status);

    await new Promise(resolve => setTimeout(resolve, 1000));

    let result: false | CacheStatus = false;
    if(full) {
      const updateParamsFull: CacheParams = {
        action: 'update',
        startDate: moment(startDate).toDate(),
        endDate: moment(endDate).toDate(),
        selectedBikeparkIDs: [],
        allDates: false,
        allBikeparks: true
      }
      console.log("*** Update cache full mode", updateParamsFull);
      result = await updateTransactionCache(updateParamsFull);
    } else {
      for(let thedate = moment(startDate); thedate.isBefore(moment(endDate).add(1, 'day')); thedate.add(1, 'day')) {
        const updateParamsIncremental: CacheParams = {
          action: 'update',
          startDate: thedate.toDate(),
          endDate: thedate.add(1, 'day').toDate(),
          selectedBikeparkIDs: [],
          allDates: true,
          allBikeparks: true
        }

        console.log("*** Update cache incremental mode", updateParamsIncremental);
        // result = await updateTransactionCache(updateParamsIncremental);
     }
    }

    return result;
}


export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    console.log("*** Test update cache started");
    
    // TODO: Uncomment when bearer token authentication is implemented
    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   res.status(401).json({ error: "Bearer token required" });
    //   return;
    // }
    
    const { full } = req.body;
    const isFull = full === true;

    const thestart = "1/1/2025"
    const theend = "1/2/2025"
    
    const startDate = moment(thestart).toISOString();
    const endDate = moment(theend).toISOString(); 

    // const tables = ['transactionscache', 'bezettingencache', 'stallingsduurcache'];
    const tables = ['transactionscache'];
    
    console.log("*** Test update cache - full mode:", isFull);

    let resultTransactionCache = await testTransactionCache(startDate, endDate, isFull);
        
    console.log("*** Test update cache completed");
    
    res.status(200).json({
      success: true,
      message: `Test cache update completed successfully in ${isFull ? 'FULL' : 'INCREMENTAL'} mode`,
      mode: isFull ? 'FULL' : 'INCREMENTAL',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("*** Test update cache error:", error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

