import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

export interface TransactieRecord {
  ID: number;
  FietsenstallingID: string;
  SectieID: string | null;
  PasID: string;
  BarcodeFiets_in: string | null;
  BarcodeFiets_uit: string | null;
  Date_checkin: string;
  Date_checkout: string | null;
  Stallingsduur: number | null;
  Type_checkin: string | null;
  Type_checkout: string | null;
  Stallingskosten: number | null;
  dateCreated: string;
}

export interface TransactiesResponse {
  data: TransactieRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * GET transacties with optional filters.
 * Supports bikeparkID (StallingsID) or FietsenstallingID, and dateCheckinFrom.
 * Requires wachtrij or fietsberaad_superadmin.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransactiesResponse | { error: string }>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  // Check wachtrij access (fietsberaad admin/superadmin have wachtrij by default).
  // Also allow fietsberaad_superadmin for parking simulation context (user may have switched to testgemeente contact).
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
    const FietsenstallingID = req.query.FietsenstallingID as string | undefined;
    const dateCheckinFrom = req.query.dateCheckinFrom as string | undefined;
    const useNewTables = req.query.useNewTables === "true" || req.query.useNewTables === "1";

    const validPageSizes = [25, 100, 1000, 10000];
    const finalPageSize = validPageSizes.includes(pageSize) ? pageSize : 25;

    const where: { FietsenstallingID?: string; Date_checkin?: { gte: Date } } = {};

    if (bikeparkID) {
      const stalling = await prisma.fietsenstallingen.findFirst({
        where: { StallingsID: bikeparkID, Status: "1" },
        select: { ID: true },
      });
      if (!stalling) {
        return res.status(200).json({
          data: [],
          pagination: { page: 1, pageSize: finalPageSize, total: 0, totalPages: 0 },
        });
      }
      where.FietsenstallingID = stalling.ID;
    } else if (FietsenstallingID) {
      where.FietsenstallingID = FietsenstallingID;
    }

    if (dateCheckinFrom) {
      const from = new Date(dateCheckinFrom);
      if (!isNaN(from.getTime())) where.Date_checkin = { gte: from };
    }

    const [total, records] = useNewTables
      ? await Promise.all([
          prisma.new_transacties.count({ where }),
          prisma.new_transacties.findMany({
            where,
            select: {
              ID: true,
              FietsenstallingID: true,
              SectieID: true,
              PasID: true,
              BarcodeFiets_in: true,
              BarcodeFiets_uit: true,
              Date_checkin: true,
              Date_checkout: true,
              Stallingsduur: true,
              Type_checkin: true,
              Type_checkout: true,
              Stallingskosten: true,
              dateCreated: true,
            },
            orderBy: { dateCreated: "desc" },
            skip: (page - 1) * finalPageSize,
            take: finalPageSize,
          }),
        ])
      : await Promise.all([
          prisma.transacties.count({ where }),
          prisma.transacties.findMany({
            where,
            select: {
              ID: true,
              FietsenstallingID: true,
              SectieID: true,
              PasID: true,
              BarcodeFiets_in: true,
              BarcodeFiets_uit: true,
              Date_checkin: true,
              Date_checkout: true,
              Stallingsduur: true,
              Type_checkin: true,
              Type_checkout: true,
              Stallingskosten: true,
              dateCreated: true,
            },
            orderBy: { dateCreated: "desc" },
            skip: (page - 1) * finalPageSize,
            take: finalPageSize,
          }),
        ]);

    const totalPages = Math.ceil(total / finalPageSize);

    const response: TransactiesResponse = {
      data: records.map((r) => ({
        ID: r.ID,
        FietsenstallingID: r.FietsenstallingID,
        SectieID: r.SectieID,
        PasID: r.PasID,
        BarcodeFiets_in: r.BarcodeFiets_in,
        BarcodeFiets_uit: r.BarcodeFiets_uit,
        Date_checkin: r.Date_checkin.toISOString(),
        Date_checkout: r.Date_checkout?.toISOString() ?? null,
        Stallingsduur: r.Stallingsduur,
        Type_checkin: r.Type_checkin,
        Type_checkout: r.Type_checkout,
        Stallingskosten: r.Stallingskosten != null ? Number(r.Stallingskosten) : null,
        dateCreated: r.dateCreated.toISOString(),
      })),
      pagination: {
        page,
        pageSize: finalPageSize,
        total,
        totalPages,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching transacties:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
