import { getSQL as getTransactionsByPeriodSQL } from "~/backend/services/reports/transactionsByPeriod";
import { getSQL as getBezettingsdataSQL } from "~/backend/services/reports/bezettingsdataByPeriod";
import { getSQL as getStallingsduurSQL } from "~/backend/services/reports/stallingsduur";
import { type ReportParams, type ReportType } from "~/components/beheer/reports/ReportsFilter";
import { getData } from "~/backend/services/reports/ReportFunctions";
import {
  type AvailableDataDetailedResult,
  type AvailableDataPerStallingResult,
  getSQLDetailed as getAvailableDataSQLDetailed,
  getSQLPerBikepark as getAvailableDataSQLPerBikepark
} from "~/backend/services/reports/availableData";
import { prisma } from "~/server/db";

const ReportService = {
  //   getStallingduurData: async () => {
  //     const data: ReportData = {
  //         title: "Stallingduur",
  //         columns: ["columnA", "columnB"],
  //         data: [["dataA1", 1], ["dataA2", 2]]
  //     }

  //     return data;
  //   },
  getTransactionsPerPeriodData: async (params: ReportParams) => {
    try {
      const sql = getTransactionsByPeriodSQL(params);
      if (!sql) {
        console.error("No result from getTransactionsByPeriodSQL");
        return false;
      }
      const data = await getData(sql, params);

      return data;
    } catch (error) {
      console.error(error);
      return false;
    }
  },
  getBezettingsdata: async (params: ReportParams) => {
    try {
      const sql = getBezettingsdataSQL(params); // , queryParams
      if (!sql) {
        console.error("No result from getBezettingsdataSQL");
        return false;
      }
      const data = await getData(sql, params);

      return data;
    } catch (error) {
      console.error(error);
      return false;
    }
  },

  getStallingsduurData: async (params: ReportParams) => {
    try {
      const sql = getStallingsduurSQL(params); // , queryParams
      if (!sql) {
        console.error("No result from getStallingsduurSQL");
        return false;
      }

      const data = await getData(sql, params);

      return data;
    } catch (error) {
      console.error(error);
      return false;
    }
  },

  getAvailableDataDetailed: async (reportType: ReportType, possibleBikeparkIDs: string[], startDT: Date | undefined, endDT: Date | undefined) => {
    try {
      const sql = getAvailableDataSQLDetailed(reportType, possibleBikeparkIDs, startDT, endDT);
      if (!sql) {
        console.error("No result from getAvailableDataSQLDetailed");
        return false;
      }

      const data = await prisma.$queryRawUnsafe<AvailableDataDetailedResult[]>(sql);
      return data.map(d => ({
        locationID: d.locationID,
        yearmonth: d.yearmonth,
        count: d.total.toString()
      }));
    } catch (error) {
      console.error(error);
      return false;
    }
  },

  getAvailableDataPerBikepark: async (reportType: ReportType, possibleBikeparkIDs: string[], startDT: Date | undefined, endDT: Date | undefined) => {
    try {
      const sql = getAvailableDataSQLPerBikepark(reportType, possibleBikeparkIDs, startDT, endDT);
      if (!sql) {
        console.error("No result from getAvailableDataSQLDetailed");
        return false;
      }

      const data = await prisma.$queryRawUnsafe<AvailableDataPerStallingResult[]>(sql);
      return data.map(d => ({
        locationID: d.locationID,
        count: d.total.toString()
      }));
    } catch (error) {
      console.error(error);
      return false;
    }
  },

};

export default ReportService;
