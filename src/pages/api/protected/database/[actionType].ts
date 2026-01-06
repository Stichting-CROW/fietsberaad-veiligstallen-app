import type { NextApiRequest, NextApiResponse } from "next";
import DatabaseService, { type CacheParams, type UserContactRoleParams, type UserStatusParams, type HelpdeskHandmatigIngesteldParams } from "~/backend/services/database-service";
import ReportService from "~/backend/services/reports-service";
import { type ReportType, reportTypeValues } from "~/components/beheer/reports/ReportsFilter";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { handleApiError } from "~/utils/formatPrismaError";
const dateSchema = z.string().datetime();

const UserStatusParamsSchema = z.object({
  databaseParams: z.object({
    action: z.enum(['clear', 'rebuild', 'status', 'createtable', 'droptable', 'update']),
  }),
});

const HelpdeskHandmatigIngesteldParamsSchema = z.object({
  databaseParams: z.object({
    action: z.enum(['status', 'createtable', 'droptable', 'update']),
  }),
});

const UserContactRoleParamsSchema = z.object({
  databaseParams: z.object({
    action: z.enum(['clear', 'rebuild', 'status', 'createtable', 'droptable', 'update', 'checktable']),
  }),
});

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
  console.log("*** database (protected) actionType", req.query.actionType);
  // Require authentication and rapportages role for report-related database operations
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const hasDatabase = 
    userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_admin) ||
    userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin); 

  try {
    if (req.method === 'POST') {
      switch (req.query.actionType) {
        case "userstatus": {
          if (!hasDatabase) {
            console.error("Access denied - insufficient permissions for database operations");
            res.status(403).json({error: "Access denied - insufficient permissions"}); // Forbidden
            return;
          }

          const parseResult = UserStatusParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const params = parseResult.data.databaseParams as unknown as UserStatusParams;
          const result = await DatabaseService.manageUserStatusTable(params);
          return res.json(result);
        }
        case "helpdeskhandmatigingesteld": {
          if (!hasDatabase) {
            console.error("Access denied - insufficient permissions for database operations");
            res.status(403).json({error: "Access denied - insufficient permissions"}); // Forbidden
            return;
          }

          const parseResult = HelpdeskHandmatigIngesteldParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const params = parseResult.data.databaseParams as unknown as HelpdeskHandmatigIngesteldParams;
          const result = await DatabaseService.manageHelpdeskHandmatigIngesteldField(params);
          return res.json(result);
        }
        case "usercontactrole": {
          if (!hasDatabase) {
            console.error("Access denied - insufficient permissions for database operations");
            res.status(403).json({error: "Access denied - insufficient permissions"}); // Forbidden
            return;
          }

          const parseResult = UserContactRoleParamsSchema.safeParse(req.body);
          if (!parseResult.success) {
            return res.status(400).json({
              error: "Invalid parameters",
              details: parseResult.error.errors
            });
          }

          const params = parseResult.data.databaseParams as unknown as UserContactRoleParams;
          console.log("**** manageUserContactRoleTable: params", params);
          const result = await DatabaseService.manageUserContactRoleTable(params);
          return res.json(result);
        }

        case "transactionscache":
        case "bezettingencache":
        case "stallingsduurcache": {
          if (!hasDatabase) {
            console.error("Access denied - insufficient permissions for database operations");
            res.status(403).json({error: "Access denied - insufficient permissions"}); // Forbidden
            return;
          }

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
    const errorResponse = handleApiError("database/[actionType]", error);
    return res.status(errorResponse.status).json(errorResponse.response);
  }
}
