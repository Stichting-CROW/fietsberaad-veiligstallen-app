import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { updateBezettingsdata } from "~/server/services/bezettingsdata/update-bezettingsdata-service";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/**
 * POST: Trigger update of bezettingsdata (report bezetting path + FMS path).
 * Same auth as process-queue: fietsberaad_superadmin only.
 * Writes production bezettingsdata, scoped to the testgemeente site when present.
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

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });

  const siteID = contact?.ID ?? null;

  const dateEnd = new Date();
  const dateStart = new Date(dateEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await updateBezettingsdata({
      dateStart,
      dateEnd,
      siteID,
    });

    const total = result.lumiguideRows + result.fmsRows;
    return res.status(200).json({
      ok: true,
      message: `Report bezetting: ${result.lumiguideRows} rows, from transacties: ${result.fmsRows} rows (${result.fmsSectionsProcessed} sections)`,
      rowsProcessed: total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[update-bezettingsdata] Error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
