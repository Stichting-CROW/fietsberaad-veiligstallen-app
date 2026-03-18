import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";

export type StatisticsDataRow = {
  bikeparkID: string;
  countTransacties: number;  // uploadJsonTransaction, uploadJsonTransactions
  countPasids: number;       // saveJsonBike, saveJsonBikes
  countBetalingen: number;   // addJsonSaldo, addJsonSaldos
  countSync: number;         // syncSector
  countReportOccupation: number;  // reportOccupationData, reportJsonOccupationData
  countUpdateLocker: number; // updateLocker (from webservice_log)
  countAddSubscription: number; // addSubscription (from webservice_log)
  countSubscribe: number;    // subscribe (from webservice_log)
};

/**
 * GET statistics per stalling (light: aggregate counts from wachtrij_* and bezettingsdata_tmp).
 * Counts map to V1/V2/V3 API write method calls:
 * - countTransacties: uploadJsonTransaction, uploadJsonTransactions
 * - countPasids: saveJsonBike, saveJsonBikes
 * - countBetalingen: addJsonSaldo, addJsonSaldos
 * - countSync: syncSector
 * - countReportOccupation: reportOccupationData, reportJsonOccupationData
 * - countUpdateLocker: updateLocker (from webservice_log, if populated)
 * Query: dateStart (optional). Filter: date >= dateStart.
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

  const dateStartRaw = (req.query.dateStart as string) || "2025-01-01";
  const dateStart = /^\d{4}-\d{2}-\d{2}$/.test(dateStartRaw) ? dateStartRaw : "2025-01-01";
  const dateFilter = `AND (transactionDate IS NULL OR transactionDate >= '${dateStart} 00:00:00')`;
  const dateFilterBezetting = `AND (dateModified >= '${dateStart} 00:00:00')`;

  const collate = "COLLATE utf8mb4_unicode_ci";

  type CountRow = { bikeparkID: string; cnt: bigint };
  const toNum = (r: CountRow) => Number(r.cnt ?? 0);

  const dateFilterWebserviceLog = `AND tijdstip >= '${dateStart} 00:00:00'`;

  const [wt, wp, wb, ws, bdt, nbdt, nwt, nwp, nwb, nws, wsl, wsa, wss] = await Promise.all([
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM wachtrij_transacties WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM wachtrij_pasids WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM wachtrij_betalingen WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM wachtrij_sync WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM bezettingsdata_tmp WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilterBezetting} GROUP BY bikeparkID`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM new_bezettingsdata_tmp WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilterBezetting} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM new_wachtrij_transacties WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM new_wachtrij_pasids WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM new_wachtrij_betalingen WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM new_wachtrij_sync WHERE bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilter} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM webservice_log WHERE LOWER(TRIM(method)) = 'updatelocker' AND bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilterWebserviceLog} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM webservice_log WHERE LOWER(TRIM(method)) = 'addsubscription' AND bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilterWebserviceLog} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT bikeparkID ${collate} AS bikeparkID, COUNT(*) AS cnt FROM webservice_log WHERE LOWER(TRIM(method)) = 'subscribe' AND bikeparkID IS NOT NULL AND bikeparkID != '' ${dateFilterWebserviceLog} GROUP BY bikeparkID`
    ).catch(() => [] as CountRow[]),
  ]);

  const toMap = (rows: CountRow[]) => new Map(rows.map((r) => [r.bikeparkID, toNum(r)]));
  const mWt = toMap(wt);
  const mWp = toMap(wp);
  const mWb = toMap(wb);
  const mWs = toMap(ws);
  const mBdt = toMap(bdt);
  const mNbdt = toMap(nbdt);
  const mNwt = toMap(nwt);
  const mNwp = toMap(nwp);
  const mNwb = toMap(nwb);
  const mNws = toMap(nws);
  const mWsl = toMap(wsl);
  const mWsa = toMap(wsa);
  const mWss = toMap(wss);

  const allIds = new Set([
    ...mWt.keys(),
    ...mWp.keys(),
    ...mWb.keys(),
    ...mWs.keys(),
    ...mBdt.keys(),
    ...mNbdt.keys(),
    ...mNwt.keys(),
    ...mNwp.keys(),
    ...mNwb.keys(),
    ...mNws.keys(),
    ...mWsl.keys(),
    ...mWsa.keys(),
    ...mWss.keys(),
  ]);

  const data: StatisticsDataRow[] = Array.from(allIds).map((bikeparkID) => ({
    bikeparkID,
    countTransacties: (mWt.get(bikeparkID) ?? 0) + (mNwt.get(bikeparkID) ?? 0),
    countPasids: (mWp.get(bikeparkID) ?? 0) + (mNwp.get(bikeparkID) ?? 0),
    countBetalingen: (mWb.get(bikeparkID) ?? 0) + (mNwb.get(bikeparkID) ?? 0),
    countSync: (mWs.get(bikeparkID) ?? 0) + (mNws.get(bikeparkID) ?? 0),
    countReportOccupation: (mBdt.get(bikeparkID) ?? 0) + (mNbdt.get(bikeparkID) ?? 0),
    countUpdateLocker: mWsl.get(bikeparkID) ?? 0,
    countAddSubscription: mWsa.get(bikeparkID) ?? 0,
    countSubscribe: mWss.get(bikeparkID) ?? 0,
  }));

  return res.status(200).json({ data, dateStart });
}
