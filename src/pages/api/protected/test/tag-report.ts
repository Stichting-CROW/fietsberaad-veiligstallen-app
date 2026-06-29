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

export interface TagReportStallingRecord {
  ID: number;
  Date_checkin: string;
  Date_checkout: string | null;
  Stallingsduur: number | null;
  dateCreated: string;
  FietsenstallingID: string;
  StallingTitle: string | null;
  StallingsID: string | null;
  StallingPlaats: string | null;
  GemeenteName: string | null;
  SiteID: string | null;
  SectieID: string | null;
  SectieName: string | null;
  SectieDescription: string | null;
  SectieID_uit: string | null;
  SectieName_uit: string | null;
  SectieDescription_uit: string | null;
  PlaceID: number | null;
  PlaceTitle: string | null;
  ExternalPlaceID: string | null;
  PasID: string;
  PasNaam: string | null;
  Pastype: string | null;
  AccountName: string | null;
  AccountEmail: string | null;
  BarcodeFiets_in: string | null;
  BarcodeFiets_uit: string | null;
  BikeTypeID: number;
  BikeTypeName: string | null;
  ClientTypeID: number;
  ClientTypeName: string | null;
  Type_checkin: string | null;
  Type_checkout: string | null;
  Stallingskosten: number | null;
  ExploitantID: string | null;
  ExploitantName: string | null;
}

export interface TagReportFinancialRecord {
  ID: string;
  transactionDate: string | null;
  depositDate: string | null;
  dateCreated: string;
  amount: number | null;
  btw: number | null;
  btwPercentage: number | null;
  transactiekosten: number | null;
  paymentMethod: string | null;
  status: string | null;
  description: string | null;
  code: string | null;
  mollieTransactionID: string | null;
  accountID: string | null;
  AccountName: string | null;
  AccountEmail: string | null;
  siteID: string | null;
  SiteName: string | null;
  paidToSiteID: string | null;
  PaidToSiteName: string | null;
  paidBySiteID: string | null;
  PaidBySiteName: string | null;
  sourceSiteID: string | null;
  SourceSiteName: string | null;
  targetSiteID: string | null;
  TargetSiteName: string | null;
  bikeparkID: string | null;
  StallingTitle: string | null;
  StallingsID: string | null;
  sectionID: string | null;
  SectieName: string | null;
  placeID: number | null;
  PlaceTitle: string | null;
  transactionID: number | null;
  subscriptiontypeID: number | null;
  SubscriptionTypeName: string | null;
  subscriptionID: number | null;
  reservationID: number | null;
}

/** @deprecated Use TagReportStallingRecord */
export type TagReportRecord = TagReportStallingRecord;

export interface TagReportPasidInfo {
  pasidRecordId: string;
  pasID: string;
  naam: string | null;
  pastype: string;
  barcodeFiets: string | null;
  RFID: string | null;
  RFIDBike: string | null;
  siteID: string | null;
  siteName: string | null;
  bikeTypeID: number | null;
  bikeTypeName: string | null;
  huidigeStallingskosten: number | null;
  dateLastCheck: string | null;
  dateCreated: string | null;
  currentlyParkedStallingTitle: string | null;
  currentlyParkedStallingsID: string | null;
  currentlyParkedSectionName: string | null;
  currentlyParkedSectionID: string | null;
}

export interface TagReportAccountInfo {
  accountID: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  addressLine: string | null;
  zip: string | null;
  city: string | null;
  saldo: number | null;
  dateLastSaldoUpdate: string | null;
  dateRegistration: string | null;
  lastLogin: string | null;
  status: string | null;
  accountType: string | null;
  pasids: TagReportPasidInfo[];
}

export interface TagReportResponse {
  /** Normalized sleutelhanger barcode (12 digits). */
  barcode: string;
  /** @deprecated Use `barcode`. Kept for backwards compatibility. */
  tag: string;
  accountInfo: TagReportAccountInfo[];
  stallingTransacties: TagReportStallingRecord[];
  financialTransacties: TagReportFinancialRecord[];
  totals: {
    stalling: number;
    financial: number;
  };
}

function buildSleutelhangerTransactiesWhere(barcode: string, pasIds: string[]) {
  const pasIdFilters = [...new Set([...pasIds, barcode])];
  return {
    OR: [
      { PasID: { in: pasIdFilters } },
      { BarcodeFiets_in: barcode },
      { BarcodeFiets_uit: barcode },
    ],
  };
}

/**
 * GET tag report: stalling + financial transacties for a sleutelhanger barcode.
 * The barcode is stored as PasID on accounts_pasids and transacties.
 * No year filter — full history.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TagReportResponse | { error: string }>
) {
  if (!(await ensurePassReportAccess(req, res))) return;

  const rawInput =
    (req.query.barcode as string | undefined) ?? (req.query.tag as string | undefined);
  const barcode = normalizeBarcodeInput(rawInput?.trim() ?? "");
  if (!barcode) {
    res.status(400).json({ error: "barcode parameter is required" });
    return;
  }

  try {
    let tagPasids = await prisma.accounts_pasids.findMany({
      where: {
        OR: [
          { PasID: barcode, Pastype: "sleutelhanger" },
          { PasID: barcode },
        ],
      },
      select: ACCOUNTS_PASIDS_SELECT,
    });

    let pasIds = [...new Set([...tagPasids.map((r) => r.PasID), barcode])];

    const transactieRecords: TransactieSelectRow[] = await prisma.transacties.findMany({
      where: buildSleutelhangerTransactiesWhere(barcode, pasIds),
      select: TRANSACTIES_SELECT,
      orderBy: { Date_checkin: "desc" },
    });

    if (tagPasids.length === 0 && transactieRecords.length > 0) {
      const pasIdsFromTransacties = [...new Set(transactieRecords.map((r) => r.PasID))];
      tagPasids = await prisma.accounts_pasids.findMany({
        where: { PasID: { in: pasIdsFromTransacties } },
        select: ACCOUNTS_PASIDS_SELECT,
      });
      pasIds = [...new Set([...tagPasids.map((r) => r.PasID), barcode, ...pasIdsFromTransacties])];
    }

    const tagAccountIds = [
      ...new Set(tagPasids.map((r) => r.AccountID).filter((id): id is string => !!id)),
    ];
    const primaryPasId = tagPasids[0]?.PasID ?? transactieRecords[0]?.PasID ?? barcode;
    const liveTransactieIds = new Set(transactieRecords.map((r) => r.ID));

    const archiefRecords = await loadArchiefRecords(
      tagAccountIds,
      liveTransactieIds,
      primaryPasId
    );
    const records = mergeStallingRecords(transactieRecords, archiefRecords);

    const { accountInfo, stallingTransacties, financialTransacties } = await assemblePassReport(
      tagPasids,
      records
    );

    return res.status(200).json({
      barcode,
      tag: barcode,
      accountInfo,
      stallingTransacties,
      financialTransacties,
      totals: {
        stalling: stallingTransacties.length,
        financial: financialTransacties.length,
      },
    });
  } catch (error) {
    console.error("Error fetching tag report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
