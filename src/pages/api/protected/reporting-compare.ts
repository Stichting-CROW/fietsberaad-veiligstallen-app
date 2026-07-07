import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import {
  compareReporting,
  type ReportCompareType,
} from "~/server/services/reporting-compare/reporting-compare-service";

const VALID_TYPES: ReportCompareType[] = ["transacties", "ruwedata", "bezetting"];

/**
 * POST /api/protected/reporting-compare
 * Body: { reportType, dateStart, dateEnd, allData?, dataOwnerId?, stallingId?, source? }
 * Returns a 1-on-1 comparison of a rapportage between old (ColdFusion) production
 * tables and new (Next.js) shadow tables. Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const body = (req.body ?? {}) as {
    reportType?: string;
    dateStart?: string;
    dateEnd?: string;
    allData?: boolean;
    dataOwnerId?: string;
    stallingId?: string;
    source?: string;
  };

  const reportType = body.reportType as ReportCompareType;
  if (!VALID_TYPES.includes(reportType)) {
    return res.status(400).json({ message: `Ongeldig reportType. Kies uit: ${VALID_TYPES.join(", ")}` });
  }

  try {
    const result = await compareReporting({
      reportType,
      dateStart: body.dateStart ?? "2025-01-01",
      dateEnd: body.dateEnd ?? "2100-01-01",
      allData: !!body.allData,
      dataOwnerId: body.dataOwnerId,
      stallingId: body.stallingId,
      source: body.source,
    });
    return res.status(200).json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reporting-compare] error:", msg);
    return res.status(500).json({ message: "Fout bij vergelijken: " + msg });
  }
}
