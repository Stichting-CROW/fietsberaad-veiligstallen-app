import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

export type WachtrijManagedTransactie = {
  ID: number;
  bikeparkID: string;
  externalTransactionID: string;
  idcode: string | null;
  checkindate: string | null;
  checkoutdate: string | null;
  processed: number;
  processDate: string | null;
  error: string | null;
  dateCreated: string;
};

/**
 * GET new_wachtrij_managed_transacties (Next.js-only managed queue).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ data: WachtrijManagedTransactie[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } | { error: string }>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  const hasAccess =
    userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij) ||
    userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  if (!hasAccess) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;
    const bikeparkID = req.query.bikeparkID as string | undefined;
    const dateCreatedFrom = req.query.dateCreatedFrom as string | undefined;
    const validPageSizes = [25, 100, 1000, 10000];
    const finalPageSize = validPageSizes.includes(pageSize) ? pageSize : 25;

    const where: { bikeparkID?: string; dateCreated?: { gte: Date } } = {};
    if (bikeparkID) where.bikeparkID = bikeparkID;
    if (dateCreatedFrom) {
      const from = new Date(dateCreatedFrom);
      if (!isNaN(from.getTime())) where.dateCreated = { gte: from };
    }

    const [total, records] = await Promise.all([
      prisma.new_wachtrij_managed_transacties.count({ where }),
      prisma.new_wachtrij_managed_transacties.findMany({
        where,
        orderBy: { dateCreated: "desc" },
        skip: (page - 1) * finalPageSize,
        take: finalPageSize,
      }),
    ]);

    const data: WachtrijManagedTransactie[] = records.map((r) => {
      let idcode: string | null = null;
      let checkindate: string | null = null;
      let checkoutdate: string | null = null;
      try {
        const payload = JSON.parse(r.payload) as Record<string, unknown>;
        idcode = payload.idcode != null ? String(payload.idcode) : null;
        checkindate = payload.checkindate != null ? String(payload.checkindate) : null;
        checkoutdate = payload.checkoutdate != null ? String(payload.checkoutdate) : null;
      } catch {
        /* ignore */
      }
      return {
        ID: r.ID,
        bikeparkID: r.bikeparkID,
        externalTransactionID: r.externalTransactionID,
        idcode,
        checkindate,
        checkoutdate,
        processed: r.processed,
        processDate: r.processDate?.toISOString() ?? null,
        error: r.error,
        dateCreated: r.dateCreated.toISOString(),
      };
    });

    return res.status(200).json({
      data,
      pagination: {
        page,
        pageSize: finalPageSize,
        total,
        totalPages: Math.ceil(total / finalPageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching new_wachtrij_managed_transacties:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
