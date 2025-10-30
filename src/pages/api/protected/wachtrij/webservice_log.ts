import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import type { WebserviceLogResponse } from "~/types/wachtrij";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebserviceLogResponse | { error: string }>
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
    console.error("Access denied - insufficient permissions for webservice_log");
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    if (req.method === "GET") {
      // Parse query parameters
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const method = req.query.method as string || 'all';

      // Validate pageSize
      const validPageSizes = [20, 50, 100, 200, 500];
      const finalPageSize = validPageSizes.includes(pageSize) ? pageSize : 20;

      // Build where clause for method filtering
      const where = method && method !== 'all' 
        ? { method: method }
        : {};

      // Get unique methods for filter dropdown
      const methods = await prisma.webservice_log.findMany({
        select: { method: true },
        distinct: ['method'],
        where: { method: { not: null } },
        orderBy: { method: 'asc' }
      });

      const availableMethods = methods.map(m => m.method).filter(Boolean) as string[];

      // Get total count for pagination
      const total = await prisma.webservice_log.count({ where });

      // Get paginated records
      const records = await prisma.webservice_log.findMany({
        where,
        orderBy: { tijdstip: 'desc' },
        skip: (page - 1) * finalPageSize,
        take: finalPageSize
      });

      const totalPages = Math.ceil(total / finalPageSize);

      const response: WebserviceLogResponse = {
        data: records,
        pagination: {
          page,
          pageSize: finalPageSize,
          total,
          totalPages
        },
        availableMethods
      };

      return res.status(200).json(response);
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error fetching webservice_log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

