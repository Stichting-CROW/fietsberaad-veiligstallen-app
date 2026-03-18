import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

type BezettingsdataTmpRow = {
  ID: number;
  timestampStartInterval: string | null;
  timestamp: string | null;
  interval: number;
  source: string | null;
  bikeparkID: string | null;
  sectionID: string | null;
  brutoCapacity: number | null;
  capacity: number | null;
  bulkreserveration: number;
  occupation: number | null;
  checkins: number | null;
  checkouts: number | null;
  open: boolean | null;
  rawData: string | null;
  dateModified: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ data: BezettingsdataTmpRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } | { error: string }>
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

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const page = parseInt((req.query.page as string)) || 1;
    const pageSize = Math.min(parseInt((req.query.pageSize as string)) || 100, 500);
    const bikeparkID = req.query.bikeparkID as string | undefined;
    const useNewTables = req.query.useNewTables === "true" || req.query.useNewTables === "1";

    const where = bikeparkID ? { bikeparkID } : {};

    const [total, records] = useNewTables
      ? await Promise.all([
          prisma.new_bezettingsdata_tmp.count({ where }),
          prisma.new_bezettingsdata_tmp.findMany({
            where,
            orderBy: { dateModified: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
        ])
      : await Promise.all([
          prisma.bezettingsdata_tmp.count({ where }),
          prisma.bezettingsdata_tmp.findMany({
            where,
            orderBy: { dateModified: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
        ]);

    const data = records.map((r) => ({
      ID: r.ID,
      timestampStartInterval: r.timestampStartInterval?.toISOString() ?? null,
      timestamp: r.timestamp?.toISOString() ?? null,
      interval: r.interval,
      source: r.source,
      bikeparkID: r.bikeparkID,
      sectionID: r.sectionID,
      brutoCapacity: r.brutoCapacity,
      capacity: r.capacity,
      bulkreserveration: r.bulkreserveration,
      occupation: r.occupation,
      checkins: r.checkins,
      checkouts: r.checkouts,
      open: r.open,
      rawData: r.rawData,
      dateModified: r.dateModified.toISOString(),
    }));

    return res.status(200).json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching bezettingsdata_tmp:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
