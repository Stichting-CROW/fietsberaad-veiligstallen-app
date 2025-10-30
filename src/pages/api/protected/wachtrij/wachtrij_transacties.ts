import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import type { WachtrijTransacties, WachtrijResponse, WachtrijSummary } from "~/types/wachtrij";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WachtrijResponse<WachtrijTransacties> | { error: string }>
) {
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  // Check wachtrij access rights
  const hasAccess = userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij);

  if (!hasAccess) {
    console.error("Access denied - insufficient permissions for wachtrij_transacties");
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    if (req.method === "GET") {
      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      // Validate pageSize
      const validPageSizes = [20, 50, 100, 200, 500];
      const finalPageSize = validPageSizes.includes(pageSize) ? pageSize : 20;

      // Get total count for pagination
      const total = await prisma.wachtrij_transacties.count();

      // Get paginated records
      const records = await prisma.wachtrij_transacties.findMany({
        select: {
          ID: true,
          bikeparkID: true,
          sectionID: true,
          passID: true,
          type: true,
          transactionDate: true,
          processed: true,
          processDate: true,
          error: true,
          dateCreated: true
        },
        orderBy: { dateCreated: 'desc' },
        skip: (page - 1) * finalPageSize,
        take: finalPageSize
      });

      // Get summary counts
      const summaryData = await prisma.wachtrij_transacties.groupBy({
        by: ['processed'],
        _count: { ID: true }
      });

      // Calculate summary (boolean processed field)
      const pendingCount = summaryData.find(s => s.processed === false)?._count.ID || 0;
      const processedCount = summaryData.find(s => s.processed === true)?._count.ID || 0;
      
      const summary: WachtrijSummary = {
        total: total,
        pending: pendingCount,
        processing: 0, // Boolean fields don't have processing state
        success: processedCount,
        error: 0 // Boolean fields don't distinguish errors
      };

      const totalPages = Math.ceil(total / finalPageSize);

      const response: WachtrijResponse<WachtrijTransacties> = {
        data: records,
        summary,
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
    console.error("Error fetching wachtrij_transacties:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
