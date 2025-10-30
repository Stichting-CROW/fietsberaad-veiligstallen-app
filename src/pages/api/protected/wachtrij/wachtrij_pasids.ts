import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import type { WachtrijPasids, WachtrijResponse, WachtrijSummary } from "~/types/wachtrij";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WachtrijResponse<WachtrijPasids> | { error: string }>
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
    console.error("Access denied - insufficient permissions for wachtrij_pasids");
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

      // Perform count and page fetch in parallel (summary removed)
      const [total, records] = await Promise.all([
        prisma.wachtrij_pasids.count(),
        prisma.wachtrij_pasids.findMany({
          select: {
            ID: true,
            bikeparkID: true,
            passID: true,
            barcode: true,
            RFID: true,
            transactionDate: true,
            processed: true,
            processDate: true,
            error: true,
            DateCreated: true
          },
          orderBy: { DateCreated: 'desc' },
          skip: (page - 1) * finalPageSize,
          take: finalPageSize
        })
      ]);

      const totalPages = Math.ceil(total / finalPageSize);

      const response: WachtrijResponse<WachtrijPasids> = {
        data: records,
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
    console.error("Error fetching wachtrij_pasids:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
