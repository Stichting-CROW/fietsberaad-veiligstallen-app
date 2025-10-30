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

  // Check wachtrij access rights
  const hasAccess = userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij);

  if (!hasAccess) {
    console.error("Access denied - insufficient permissions for wachtrij_betalingen");
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
        prisma.wachtrij_betalingen.count(),
        prisma.wachtrij_betalingen.findMany({
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
          orderBy: { dateCreated: 'desc' },
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
