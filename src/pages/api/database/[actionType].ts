import type { NextApiRequest, NextApiResponse } from "next";
import DatabaseService, { CacheParams } from "~/backend/services/database-service";
import ReportService from "~/backend/services/reports-service";
import { type ReportType, reportTypeValues } from "~/components/beheer/reports/ReportsFilter";
import { z } from "zod";
const dateSchema = z.string().datetime();

const CacheParamsSchema = z.object({
  databaseParams: z.object({
    action: z.enum(['clear', 'rebuild', 'status', 'createtable', 'droptable', 'update', 'createparentindices', 'dropparentindices']),
    startDate: dateSchema.datetime(),
    endDate: dateSchema.datetime(),
    selectedBikeparkIDs: z.array(z.string()),
    allDates: z.boolean(),
    allBikeparks: z.boolean(),
  }),
});

const AvailableDataParamsSchema = z.object({
  reportType: z.enum(reportTypeValues),
  bikeparkIDs: z.array(z.string()),
  startDT: dateSchema.optional(),
  endDT: dateSchema.optional(),
  // allDates: z.boolean().optional(),
  // allBikeparks: z.boolean().optional(),
});

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'POST') {
      switch (req.query.actionType) {
        case "transactionscache":
        case "bezettingencache":
        case "stallingsduurcache": {
          const parseResult = CacheParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            console.log("BAD REQUEST", req.body, parseResult.error.errors);
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const params = parseResult.data.databaseParams as unknown as CacheParams;
          const result = req.query.actionType === "transactionscache"
            ? await DatabaseService.manageTransactionCache(params)
            : req.query.actionType === "bezettingencache"
              ? await DatabaseService.manageBezettingCache(params)
              : await DatabaseService.manageStallingsduurCache(params);

          return res.json(result);
        }

        case "availableDataDetailed": {
          const parseResult = AvailableDataParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const { reportType, bikeparkIDs, startDT, endDT } = parseResult.data;
          const data = await ReportService.getAvailableDataDetailed(
            reportType as ReportType,
            bikeparkIDs,
            startDT ? new Date(startDT) : undefined,
            endDT ? new Date(endDT) : undefined
          );
          return res.json(data);
        }

        case "availableDataPerBikepark": {
          const parseResult = AvailableDataParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const { reportType, bikeparkIDs, startDT, endDT } = parseResult.data;
          const data = await ReportService.getAvailableDataPerBikepark(
            reportType as ReportType,
            bikeparkIDs,
            startDT ? new Date(startDT) : undefined,
            endDT ? new Date(endDT) : undefined
          );
          return res.json(data);
        }

        default: {
          return res.status(405).end(); // Method Not Allowed
        }
      }
    } else {
      return res.status(405).end(); // Method Not Allowed
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
