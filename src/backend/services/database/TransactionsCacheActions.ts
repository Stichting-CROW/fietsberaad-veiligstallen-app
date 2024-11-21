import { prisma } from "~/server/db";
import { CacheParams, CacheStatus } from "~/backend/services/database-service";
import moment from "moment";

export const getTransactionCacheStatus = async (params: CacheParams) => {
    const sqldetecttable = `SELECT COUNT(*) As count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name= 'transacties_archief_day_cache'`

    let tableExists = false;
    let status: CacheStatus | false = { status: 'missing', size: undefined, firstUpdate: undefined, lastUpdate: undefined };
    try {
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
            };
        } 
        return status;
    } catch (error) {
        console.error(">>> getTransactionCacheStatus ERROR Unable to get transaction cache status", error);
        return false;
    }
}

export const updateTransactionCache = async (params: CacheParams) => {
    if(false=== await clearTransactionCache(params)) {
        console.error(">>> updateTransactionCache ERROR Unable to clear transaction cache");
        return false;
    }

    const dayBeginsAt = new Date(0, 0, 0);
    const timeIntervalInMinutes = dayBeginsAt.getHours() * 60 + dayBeginsAt.getMinutes();

    // TODO: check if timeinterval offset works correctly, link to offset settings in database
    // current db model links to contacts.DayBeginsAt field

    const conditions = [];
    if (!params.allDates) {
        conditions.push(`checkoutdate >= DATE_ADD('${moment(params.startDate).format('YYYY-MM-DD 00:00:00')}', INTERVAL -${timeIntervalInMinutes} MINUTE)`);
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
      GROUP BY locationID, date;`
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
        PRIMARY KEY (ID)
    );`;

    const sqlCreateIndex = `CREATE INDEX idx_location_date IF NOT EXISTS ON transacties_archief_day_cache (locationID, checkoutdate);`

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