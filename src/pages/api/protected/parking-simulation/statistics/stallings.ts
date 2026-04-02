import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { resolveExistingTableNames } from "~/server/utils/mysql-schema-tables";

/** Optional mirror tables used by parking simulation / FMS test queue (may be absent locally). */
const NEW_STATS_UNION_TABLES = [
  "new_wachtrij_transacties",
  "new_wachtrij_pasids",
  "new_wachtrij_betalingen",
  "new_wachtrij_sync",
  "new_bezettingsdata_tmp",
] as const;

export type StallingListItem = {
  contactName: string;
  parkingName: string;
  bikeparkID: string;
  stallingType: string;
};

/**
 * GET list of distinct stallings from wachtrij_* tables (expensive: UNION + JOINs).
 * Fetched once and cached by the client. Returns contact name, stalling name, bikeparkID.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const collate = "COLLATE utf8mb4_unicode_ci";
  const unionLegacy = `
    SELECT DISTINCT bikeparkID ${collate} AS bikeparkID FROM wachtrij_transacties WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
    UNION SELECT DISTINCT bikeparkID ${collate} FROM wachtrij_pasids WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
    UNION SELECT DISTINCT bikeparkID ${collate} FROM wachtrij_betalingen WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
    UNION SELECT DISTINCT bikeparkID ${collate} FROM wachtrij_sync WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
    UNION SELECT DISTINCT bikeparkID ${collate} FROM bezettingsdata_tmp WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
    UNION SELECT DISTINCT bikeparkID ${collate} FROM webservice_log WHERE bikeparkID IS NOT NULL AND bikeparkID != ''
  `;
  const existingNewNames = await resolveExistingTableNames(NEW_STATS_UNION_TABLES);
  const unionNew = existingNewNames
    .map(
      (t) =>
        `UNION SELECT DISTINCT bikeparkID ${collate} FROM \`${String(t).replace(/`/g, "``")}\` WHERE bikeparkID IS NOT NULL AND bikeparkID != ''`
    )
    .join("\n");

  const sql = `
    SELECT
      COALESCE(c.CompanyName, c2.CompanyName, '(onbekend)') AS contactName,
      COALESCE(f.Title, p.bikeparkID) AS parkingName,
      p.bikeparkID,
      COALESCE(f.Type, '(onbekend)') AS stallingType
    FROM (${unionLegacy}${unionNew.length > 0 ? `\n${unionNew}` : ""}) p
    INNER JOIN fietsenstallingen f ON f.StallingsID ${collate} = p.bikeparkID AND f.Status = '1'
    LEFT JOIN contacts c ON c.ID = f.SiteID
    LEFT JOIN contacts c2 ON c2.ID = f.ExploitantID
    ORDER BY contactName, parkingName
  `;

  const data = await prisma.$queryRawUnsafe<StallingListItem[]>(sql);
  return res.status(200).json({ data });
}
