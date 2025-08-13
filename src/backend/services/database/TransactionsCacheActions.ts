import { prisma } from "~/server/db";
import { type CacheParams, type CacheStatus } from "~/backend/services/database-service";
import moment from "moment";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";
import { type IndicesInfo, getParentIndicesStatus, dropParentIndices, createParentIndices } from "./cachetools";

const cacheInfo: IndicesInfo = {
  basetable: 'transacties_archief',
  indices: {
    idx_transactionscache_1: `locationID, checkoutdate, checkintype, checkouttype, checkindate`,
    idx_transactionscache_2: `sectionID, clienttypeID`,
  },
};

export const getTransactionCacheStatus = async (params: CacheParams) => {
    const sqldetecttable = `SELECT COUNT(*) As count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name= 'transacties_archief_day_cache'`

    let tableExists = false;
    const status: CacheStatus | false = { 
        status: 'missing', 
        indexstatus: 'missing',
        size: undefined, 
        firstUpdate: undefined, 
        lastUpdate: undefined, 
        originalSize: undefined, 
        originalFirstUpdate: undefined, 
        originalLastUpdate: undefined 
    };
    try {
        status.indexstatus = await getParentIndicesStatus(cacheInfo);

        const result = await prisma.$queryRawUnsafe<{ count: number }[]>(sqldetecttable); //  as 
        tableExists = result && result.length>0 && result[0] ? result[0].count > 0: false;

        if(tableExists) {
            status.status = 'available';

            const sqlGetStatistics = `SELECT COUNT(*) As count, MIN(checkoutdate) AS firstUpdate, MAX(checkoutdate) AS lastupdate FROM transacties_archief_day_cache WHERE NOT ISNULL(checkoutdate)`;
            const resultStatistics = await prisma.$queryRawUnsafe<{ count: number, firstUpdate: Date, lastupdate: Date }[]>(sqlGetStatistics);
            if(resultStatistics && resultStatistics.length>0 && resultStatistics[0]!==undefined) {
                status.size = parseInt(resultStatistics[0].count.toString());    
                status.firstUpdate = resultStatistics[0].firstUpdate;
                status.lastUpdate = resultStatistics[0].lastupdate;
            }

            // const sqlGetOriginalStatistics = `SELECT COUNT(*) As count, MIN(checkoutdate) AS firstUpdate, MAX(checkoutdate) AS lastUpdate FROM transacties_archief WHERE NOT ISNULL(checkoutdate)`;
            // const resultOriginalStatistics = await prisma.$queryRawUnsafe<{ count: number, firstUpdate: Date, lastUpdate: Date }[]>(sqlGetOriginalStatistics);
            // if (resultOriginalStatistics && resultOriginalStatistics.length > 0 && resultOriginalStatistics[0] !== undefined) {
            //     status.originalSize = parseInt(resultOriginalStatistics[0].count.toString());
            //     status.originalFirstUpdate = resultOriginalStatistics[0].firstUpdate;
            //     status.originalLastUpdate = resultOriginalStatistics[0].lastUpdate;
            // }

        } 
        return status;
    } catch (error) {
        console.error(">>> getTransactionCacheStatus ERROR Unable to get transaction cache status", error);
        return false;
    }
}

export const updateTransactionCache = async (params: CacheParams) => {
    const { timeIntervalInMinutes, adjustedStartDate } = getAdjustedStartEndDates(params.startDate, params.endDate, undefined);

    if(adjustedStartDate === undefined) {
        console.error(">>> updateTransactionCache ERROR Start date is undefined");
        return false;
    }

    const conditions = [];
    if (!params.allDates) {
        conditions.push(`checkoutdate >= DATE_ADD('${adjustedStartDate.format('YYYY-MM-DD 00:00:00')}', INTERVAL -${timeIntervalInMinutes} MINUTE)`);
    }
    if (!params.allBikeparks) {
        conditions.push(`locationID IN (${params.selectedBikeparkIDs.map(bp=>`'${bp}'`).join(',')})`);
    }

    conditions.push(`NOT ISNULL(checkoutdate)`);

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      INSERT INTO transacties_archief_day_cache (locationID, checkoutdate, count_transacties, sum_inkomsten)
      SELECT 
        locationID,
        DATE(DATE_ADD(checkoutdate, INTERVAL -${timeIntervalInMinutes} MINUTE)) AS date,
        COUNT(*) AS count_transacties,
        SUM(price) AS sum_inkomsten
      FROM transacties_archief
      ${whereClause}
      GROUP BY locationID, date
      ON DUPLICATE KEY UPDATE
        count_transacties = VALUES(count_transacties),
        sum_inkomsten = VALUES(sum_inkomsten);`
    
    /* const result = */ await prisma.$executeRawUnsafe(sql);
    return getTransactionCacheStatus(params);
}

export const clearTransactionCache = async (params: CacheParams) => {
    if(!params.allDates && !params.startDate) {
        console.error(">>> clearTransactionCache ERROR No start date provided");
        return false;
    }
    if (!params.allBikeparks && (!params.selectedBikeparkIDs || params.selectedBikeparkIDs.length===0)) {
        console.error(">>> clearTransactionCache ERROR No bikeparks selected");
        return false;
    }

    const conditions = [];
    if (!params.allDates) {
      conditions.push(`checkoutdate >= '${moment(params.startDate).format('YYYY-MM-DD 00:00:00')}'`);
    }
    if (!params.allBikeparks) {
      conditions.push(`locationID IN (${params.selectedBikeparkIDs.map(bp=>`'${bp}'`).join(',')})`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `DELETE FROM transacties_archief_day_cache ${whereClause};`;
    await prisma.$executeRawUnsafe(sql);

    return getTransactionCacheStatus(params);
}

export const createTransactionCacheTable = async (params: CacheParams) => {
    const sqlCreateTable = `CREATE TABLE IF NOT EXISTS transacties_archief_day_cache (
        ID int NOT NULL AUTO_INCREMENT,
        locationID varchar(8),
        checkoutdate DATE NULL,
        count_transacties INT,
        sum_inkomsten DECIMAL(10, 2),
        PRIMARY KEY (ID),
        UNIQUE KEY uk_location_date (locationID, checkoutdate)
    );`;

    const sqlCreateIndex = `CREATE INDEX idx_location_date ON transacties_archief_day_cache (locationID, checkoutdate);`

    const result1 = await prisma.$queryRawUnsafe(sqlCreateTable);
    if(!result1) {
        console.error("Unable to create transactions_cache table",result1);
        return false;
    }

    const result2 = await prisma.$queryRawUnsafe(sqlCreateIndex);
    if(!result2) {
        console.error("Unable to create location/date index on transactions_cache table",result2);
        return false;
    }

    return getTransactionCacheStatus(params);
}

export const dropTransactionCacheTable = async (params: CacheParams) => {
    const sql = "DROP TABLE IF EXISTS transacties_archief_day_cache";

    const result = await prisma.$queryRawUnsafe(sql);
    if(!result) {
        console.error("Unable to drop transactions_cache table",result);
        return false;
    }

    return getTransactionCacheStatus(params);
}

export const dropTransactionParentIndices = async (params: CacheParams) => {
    const success = await dropParentIndices(cacheInfo);
    if(!success) {
        console.error("Unable to drop transaction parent indices", success);
        return false;
    }

    return getTransactionCacheStatus(params);
}

export const createTransactionParentIndices = async (params: CacheParams) => {
    const success = await createParentIndices(cacheInfo);
    if(!success) {
        console.error("Unable to create transaction parent indices", success);
        return false;
    }

    return getTransactionCacheStatus(params);
}