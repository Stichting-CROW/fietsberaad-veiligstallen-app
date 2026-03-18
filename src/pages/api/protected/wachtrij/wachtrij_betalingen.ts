import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import type { WachtrijBetalingen, WachtrijResponse, WachtrijSummary } from "~/types/wachtrij";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WachtrijResponse<WachtrijBetalingen> | { error: string }>
) {
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  // Check wachtrij access (fietsberaad admin/superadmin have wachtrij by default).
  // Also allow fietsberaad_superadmin for parking simulation context (user may have switched to testgemeente contact).
  const hasAccess =
    userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij) ||
    userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  if (!hasAccess) {
    console.error("Access denied - insufficient permissions for wachtrij_betalingen");
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    if (req.method === "GET") {
      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 25;
      const sortBy = (req.query.sortBy as string) || 'dateCreated';
      const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

      // Validate pageSize
      const validPageSizes = [25, 100, 1000, 10000];
      const finalPageSize = validPageSizes.includes(pageSize) ? pageSize : 25;

      // Whitelist sortable columns
      const sortableColumns = ['ID', 'bikeparkID', 'passID', 'transactionDate', 'amount', 'processed', 'dateCreated'] as const;
      const orderByField = sortableColumns.includes(sortBy as typeof sortableColumns[number]) ? sortBy : 'dateCreated';

      const bikeparkID = req.query.bikeparkID as string | undefined;
      const transactionDateFrom = req.query.transactionDateFrom as string | undefined;
      const useNewTables = req.query.useNewTables === "true" || req.query.useNewTables === "1";
      const where: { bikeparkID?: string; transactionDate?: { gte: Date } } = {};
      if (bikeparkID) where.bikeparkID = bikeparkID;
      if (transactionDateFrom) {
        const from = new Date(transactionDateFrom);
        if (!isNaN(from.getTime())) where.transactionDate = { gte: from };
      }

      // Perform count and page fetch in parallel (summary removed)
      const [total, records] = useNewTables
        ? await Promise.all([
            prisma.new_wachtrij_betalingen.count({ where }),
            prisma.new_wachtrij_betalingen.findMany({
              where,
              select: {
                ID: true,
                bikeparkID: true,
                passID: true,
                transactionDate: true,
                amount: true,
                processed: true,
                processDate: true,
                error: true,
                dateCreated: true,
              },
              orderBy: { [orderByField]: sortOrder },
              skip: (page - 1) * finalPageSize,
              take: finalPageSize,
            }),
          ])
        : await Promise.all([
            prisma.wachtrij_betalingen.count({ where }),
            prisma.wachtrij_betalingen.findMany({
              where,
              select: {
                ID: true,
                bikeparkID: true,
                passID: true,
                transactionDate: true,
                amount: true,
                processed: true,
                processDate: true,
                error: true,
                dateCreated: true
              },
              orderBy: { [orderByField]: sortOrder },
              skip: (page - 1) * finalPageSize,
              take: finalPageSize
            })
          ]);

      const totalPages = Math.ceil(total / finalPageSize);

      // Normalize Decimal amount to number for response type compatibility
      const normalized: WachtrijBetalingen[] = records.map(r => ({
        ...r,
        amount: Number(r.amount as unknown as number)
      }));

      const response: WachtrijResponse<WachtrijBetalingen> = {
        data: normalized,
        pagination: {
          page,
          pageSize: finalPageSize,
          total,
          totalPages
        }
      };

      return res.status(200).json(response);
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error fetching wachtrij_betalingen:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
