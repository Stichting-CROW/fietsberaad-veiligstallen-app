import { prisma } from "~/server/db";
import { CacheParams, CacheStatus } from "~/backend/services/database-service";
import moment from "moment";
import { getAdjustedStartEndDates } from "~/components/beheer/reports/ReportsDateFunctions";
export const getBezettingCacheStatus = async (params: CacheParams) => {
    const sqldetecttable = `SELECT COUNT(*) As count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name= 'bezettingsdata_day_hour_cache'`;

    let tableExists = false;
    let status: CacheStatus | false = { 
        status: 'missing', 
        size: undefined, 
        firstUpdate: undefined, 
        lastUpdate: undefined, 
        originalSize: undefined, 
        originalFirstUpdate: undefined, 
        originalLastUpdate: undefined 
    };
    
    try {
        const result = await prisma.$queryRawUnsafe<{ count: number }[]>(sqldetecttable);
        tableExists = result && result.length > 0 && result[0] ? result[0].count > 0 : false;
        if (tableExists) {
            status.status = 'available';

            const sqlGetStatistics = `SELECT COUNT(*) As count, MIN(timestamp) AS firstUpdate, MAX(timestamp) AS lastupdate FROM bezettingsdata_day_hour_cache WHERE NOT ISNULL(timestamp)`;
            const resultStatistics = await prisma.$queryRawUnsafe<{ count: number, firstUpdate: Date, lastupdate: Date }[]>(sqlGetStatistics);
            if (resultStatistics && resultStatistics.length > 0 && resultStatistics[0] !== undefined) {
                status.size = parseInt(resultStatistics[0].count.toString());
                status.firstUpdate = resultStatistics[0].firstUpdate;
                status.lastUpdate = resultStatistics[0].lastupdate;
            }

            // const sqlGetOriginalStatistics = `SELECT COUNT(*) As count, MIN(timestamp) AS firstUpdate, MAX(timestamp) AS lastupdate FROM bezettingsdata WHERE NOT ISNULL(timestamp)`;
            // const resultOriginalStatistics = await prisma.$queryRawUnsafe<{ count: number, firstUpdate: Date, lastupdate: Date }[]>(sqlGetOriginalStatistics);
            // if (resultOriginalStatistics && resultOriginalStatistics.length > 0 && resultOriginalStatistics[0] !== undefined) {
            //     status.originalSize = parseInt(resultOriginalStatistics[0].count.toString());
            //     status.originalFirstUpdate = resultOriginalStatistics[0].firstUpdate;
            //     status.originalLastUpdate = resultOriginalStatistics[0].lastupdate;
            // }
        }
        return status;
    } catch (error) {
        console.error(">>> getBezettingCacheStatus ERROR Unable to get bezettingsdata cache status", error);
        return false;
    }
}

export const updateBezettingCache = async (params: CacheParams) => {
    console.log("UPDATE BEZETTING CACHE");
    
    if (false === await clearBezettingCache(params)) {
        console.error(">>> updateBezettingCache ERROR Unable to clear bezettingsdata cache");
        return false;
    }

    const { timeIntervalInMinutes, adjustedStartDate } = getAdjustedStartEndDates(params.startDate, params.endDate);

    if(adjustedStartDate === undefined) {
        console.error(">>> updateBezettingCache ERROR Start date is undefined", params);
        return false;
    }

    const conditions = [];
    if (!params.allDates) {
        conditions.push(`timestamp >= DATE_ADD('${adjustedStartDate.format('YYYY-MM-DD 00:00:00')}', INTERVAL -${timeIntervalInMinutes} MINUTE)`);
    }
    if (!params.allBikeparks) {
        const bikeparkIDs = params.selectedBikeparkIDs.length > 0 ? params.selectedBikeparkIDs.map(bp=>`'${bp}'`).join(',') : '""';
        conditions.push(`locationID IN (${bikeparkIDs})`);
    }

    conditions.push(`NOT ISNULL(timestamp)`);

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
    INSERT INTO bezettingsdata_day_hour_cache (
      timestamp, 
      \`interval\`,
      bikeparkID, 
      sectionID, 
      source, 
      fillup, 
      open,
      totalCheckins, 
      totalCheckouts, 
      totalOccupation, 
      totalCapacity
    )
    SELECT
      DATE_FORMAT(DATE_ADD(timestamp, INTERVAL -${timeIntervalInMinutes} MINUTE), '%Y-%m-%d %H:00:00') AS datehour,
      \`interval\`,
      bikeparkID,
      sectionID,
      source,
      fillup,
      open,
      SUM(checkins) AS totalCheckins,
      SUM(checkouts) AS totalCheckouts,
      SUM(occupation) AS totalOccupation,
      SUM(capacity) AS totalCapacity
    FROM bezettingsdata
      ${whereClause}
    GROUP BY 
      DATE_FORMAT(DATE_ADD(timestamp, INTERVAL -${timeIntervalInMinutes} MINUTE), '%Y-%m-%d %H:00:00'), 
      \`interval\`,
      bikeparkID, 
      sectionID, 
      source,
      fillup,
      open;`;    

    console.log("++++++++++++++++++++++")
    console.log(sql);
    /* const result = */ await prisma.$executeRawUnsafe(sql);
    return getBezettingCacheStatus(params);
}

export const clearBezettingCache = async (params: CacheParams) => {
    console.log(params);

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
      conditions.push(`timestamp >= '${moment(params.startDate).format('YYYY-MM-DD 00:00:00')}'`);
    }
    if (!params.allBikeparks) {
        const bikeparkIDs = params.selectedBikeparkIDs.length > 0 ? params.selectedBikeparkIDs.map(bp=>`'${bp}'`).join(',') : '""';
        conditions.push(`locationID IN (${bikeparkIDs})`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `DELETE FROM bezettingsdata_day_hour_cache ${whereClause};`;
    await prisma.$executeRawUnsafe(sql);

    return getBezettingCacheStatus(params);
}

export const createBezettingCacheTable = async (params: CacheParams) => {
    const sqlCreateTable = `CREATE TABLE IF NOT EXISTS bezettingsdata_day_hour_cache (
        ID int NOT NULL AUTO_INCREMENT,
        timestamp DATETIME NULL,
        \`interval\` INT DEFAULT '1',
        bikeparkID VARCHAR(255),
        sectionID VARCHAR(255),
        source VARCHAR(255),
        fillup BOOLEAN,
        open BOOLEAN,
        totalCheckins INT,
        totalCheckouts INT,
        totalOccupation INT,
        totalCapacity INT,
        perc_occupation DECIMAL(5, 2),
        PRIMARY KEY (ID)
    );`;

    const result = await prisma.$queryRawUnsafe(sqlCreateTable);
    if (!result) {
        console.error("Unable to create bezettingsdata_day_hour_cache table", result);
        return false;
    }

    return getBezettingCacheStatus(params);
}

export const dropBezettingCacheTable = async (params: CacheParams) => {
    const sql = "DROP TABLE IF EXISTS bezettingsdata_day_hour_cache";

    const result = await prisma.$queryRawUnsafe(sql);
    if (!result) {
        console.error("Unable to drop bezettingsdata_day_hour_cache table", result);
        return false;
    }

    return getBezettingCacheStatus(params);
} 