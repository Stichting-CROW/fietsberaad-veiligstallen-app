import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { assemblePassReport } from "~/server/services/test/pass-report-assembler";
import {
  ACCOUNTS_PASIDS_SELECT,
  ensurePassReportAccess,
  loadArchiefRecords,
  mergeStallingRecords,
  normalizeBarcodeInput,
  TRANSACTIES_SELECT,
  type TransactieSelectRow,
} from "~/server/services/test/pass-report-shared";
import {
  loadWachtrijRowsForBarcode,
  type BarcodeReportWachtrijRow,
} from "~/server/services/test/barcode-report-wachtrij";
import type {
  TagReportAccountInfo,
  TagReportFinancialRecord,
  TagReportStallingRecord,
} from "~/pages/api/protected/test/tag-report";

export type { BarcodeReportWachtrijRow };

export type BarcodeReportResponse = {
  barcodeFiets: string;
  accountInfo: TagReportAccountInfo[];
  stallingTransacties: TagReportStallingRecord[];
  financialTransacties: TagReportFinancialRecord[];
  wachtrijRows?: BarcodeReportWachtrijRow[];
  totals: {
    stalling: number;
    financial: number;
    wachtrij?: number;
  };
};

/**
 * GET barcode report: stalling + financial transacties for a fiets-sticker (barcodeFiets).
 * Searches transacties.BarcodeFiets_in / BarcodeFiets_uit and accounts_pasids.barcodeFiets.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BarcodeReportResponse | { error: string }>
) {
  if (!(await ensurePassReportAccess(req, res))) return;

  const barcodeFiets = normalizeBarcodeInput(
    (req.query.barcodeFiets as string | undefined)?.trim() ?? ""
  );
  if (!barcodeFiets) {
    res.status(400).json({ error: "barcodeFiets parameter is required" });
    return;
  }

  const includeWachtrijTabellen =
    req.query.wachtrijTabellen === "1" || req.query.wachtrijTabellen === "true";

  try {
    let pasids = await prisma.accounts_pasids.findMany({
      where: { barcodeFiets },
      select: ACCOUNTS_PASIDS_SELECT,
    });

    const transactieRecords: TransactieSelectRow[] = await prisma.transacties.findMany({
      where: {
        OR: [{ BarcodeFiets_in: barcodeFiets }, { BarcodeFiets_uit: barcodeFiets }],
      },
      select: TRANSACTIES_SELECT,
      orderBy: { Date_checkin: "desc" },
    });

    if (pasids.length === 0 && transactieRecords.length > 0) {
      const pasIdsFromTransacties = [...new Set(transactieRecords.map((r) => r.PasID))];
      pasids = await prisma.accounts_pasids.findMany({
        where: { PasID: { in: pasIdsFromTransacties } },
        select: ACCOUNTS_PASIDS_SELECT,
      });
    }

    const accountIds = [
      ...new Set(pasids.map((r) => r.AccountID).filter((id): id is string => !!id)),
    ];
    const primaryPasId = pasids[0]?.PasID ?? transactieRecords[0]?.PasID ?? "—";
    const liveTransactieIds = new Set(transactieRecords.map((r) => r.ID));

    const archiefRecords = await loadArchiefRecords(
      accountIds,
      liveTransactieIds,
      primaryPasId
    );
    const records = mergeStallingRecords(transactieRecords, archiefRecords);

    const { accountInfo, stallingTransacties, financialTransacties } = await assemblePassReport(
      pasids,
      records
    );

    const wachtrijRows = includeWachtrijTabellen
      ? await loadWachtrijRowsForBarcode(barcodeFiets)
      : undefined;

    return res.status(200).json({
      barcodeFiets,
      accountInfo,
      stallingTransacties,
      financialTransacties,
      ...(wachtrijRows !== undefined ? { wachtrijRows } : {}),
      totals: {
        stalling: stallingTransacties.length,
        financial: financialTransacties.length,
        ...(wachtrijRows !== undefined ? { wachtrij: wachtrijRows.length } : {}),
      },
    });
  } catch (error) {
    console.error("Error fetching barcode report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
