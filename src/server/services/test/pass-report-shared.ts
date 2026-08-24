import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

export const ACCOUNTS_PASIDS_SELECT = {
  ID: true,
  PasID: true,
  SiteID: true,
  Naam: true,
  Pastype: true,
  AccountID: true,
  barcodeFiets: true,
  RFID: true,
  RFIDBike: true,
  BikeTypeID: true,
  huidigeFietsenstallingId: true,
  huidigeSectieId: true,
  huidigeStallingskosten: true,
  dateLastCheck: true,
  dateCreated: true,
} as const;

export const TRANSACTIES_SELECT = {
  ID: true,
  FietsenstallingID: true,
  SectieID: true,
  SectieID_uit: true,
  PlaceID: true,
  ExternalPlaceID: true,
  PasID: true,
  Pastype: true,
  BarcodeFiets_in: true,
  BarcodeFiets_uit: true,
  Date_checkin: true,
  Date_checkout: true,
  Stallingsduur: true,
  Type_checkin: true,
  Type_checkout: true,
  Stallingskosten: true,
  BikeTypeID: true,
  ClientTypeID: true,
  ExploitantID: true,
  dateCreated: true,
} as const;

export const ARCHIEF_SELECT = {
  ID: true,
  locationid: true,
  sectionid: true,
  sectionid_out: true,
  placeid: true,
  externalplaceid: true,
  checkindate: true,
  checkoutdate: true,
  checkintype: true,
  checkouttype: true,
  price: true,
  biketypeid: true,
  clienttypeid: true,
  exploitantid: true,
  created: true,
} as const;

export type TransactieSelectRow = {
  ID: number;
  FietsenstallingID: string;
  SectieID: string | null;
  SectieID_uit: string | null;
  PlaceID: bigint | null;
  ExternalPlaceID: string | null;
  PasID: string;
  Pastype: number | null;
  BarcodeFiets_in: string | null;
  BarcodeFiets_uit: string | null;
  Date_checkin: Date;
  Date_checkout: Date | null;
  Stallingsduur: number | null;
  Type_checkin: string | null;
  Type_checkout: string | null;
  Stallingskosten: { toNumber?: () => number } | number | null;
  BikeTypeID: number;
  ClientTypeID: number;
  ExploitantID: string | null;
  dateCreated: Date;
};

export type ArchiefSelectRow = {
  ID: number;
  locationid: string;
  sectionid: string;
  sectionid_out: string | null;
  placeid: number | null;
  externalplaceid: string | null;
  checkindate: Date;
  checkoutdate: Date | null;
  checkintype: string;
  checkouttype: string | null;
  price: { toNumber?: () => number } | number;
  biketypeid: number;
  clienttypeid: number;
  exploitantid: string | null;
  created: Date;
};

export type StallingSourceRow = TransactieSelectRow & { source: "transacties" | "archief" };

export type PasidSelectRow = {
  ID: string;
  PasID: string;
  SiteID: string | null;
  Naam: string | null;
  Pastype: string;
  AccountID: string | null;
  barcodeFiets: string | null;
  RFID: string | null;
  RFIDBike: string | null;
  BikeTypeID: number | null;
  huidigeFietsenstallingId: string | null;
  huidigeSectieId: string | null;
  huidigeStallingskosten: { toNumber?: () => number } | number;
  dateLastCheck: Date | null;
  dateCreated: Date | null;
};

export function normalizeBarcodeInput(input: string): string {
  return input.replace(/\s+/g, "");
}

function computeStallingsduurMinutes(checkin: Date, checkout: Date | null): number | null {
  if (!checkout) return null;
  return Math.round((checkout.getTime() - checkin.getTime()) / 60_000);
}

export function mapArchiefToStallingRow(archief: ArchiefSelectRow, pasId: string): StallingSourceRow {
  return {
    source: "archief",
    ID: archief.ID,
    FietsenstallingID: archief.locationid,
    SectieID: archief.sectionid,
    SectieID_uit: archief.sectionid_out,
    PlaceID: archief.placeid != null ? BigInt(archief.placeid) : null,
    ExternalPlaceID: archief.externalplaceid,
    PasID: pasId,
    Pastype: null,
    BarcodeFiets_in: null,
    BarcodeFiets_uit: null,
    Date_checkin: archief.checkindate,
    Date_checkout: archief.checkoutdate,
    Stallingsduur: computeStallingsduurMinutes(archief.checkindate, archief.checkoutdate),
    Type_checkin: archief.checkintype,
    Type_checkout: archief.checkouttype,
    Stallingskosten: archief.price,
    BikeTypeID: archief.biketypeid,
    ClientTypeID: archief.clienttypeid,
    ExploitantID: archief.exploitantid,
    dateCreated: archief.created,
  };
}

export async function loadArchiefRecords(
  accountIds: string[],
  liveTransactieIds: Set<number>,
  primaryPasId: string
): Promise<StallingSourceRow[]> {
  if (accountIds.length === 0) return [];

  const archiefCandidateIds = [
    ...new Set(
      (
        await prisma.financialtransactions.findMany({
          where: {
            accountID: { in: accountIds },
            transactionID: { not: null },
          },
          select: { transactionID: true },
        })
      )
        .map((r) => r.transactionID!)
        .filter((id) => !liveTransactieIds.has(id))
    ),
  ];

  if (archiefCandidateIds.length === 0) return [];

  const archiefRecords = await prisma.transacties_archief.findMany({
    where: { ID: { in: archiefCandidateIds } },
    select: ARCHIEF_SELECT,
  });

  return archiefRecords.map((r) => mapArchiefToStallingRow(r, primaryPasId));
}

export async function ensurePassReportAccess(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized - no session found" });
    return false;
  }

  const hasAccess =
    userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij) ||
    userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  if (!hasAccess) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return false;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }

  return true;
}

export function mergeStallingRecords(
  transactieRecords: TransactieSelectRow[],
  archiefRecords: StallingSourceRow[]
): StallingSourceRow[] {
  return [
    ...transactieRecords.map((r) => ({ ...r, source: "transacties" as const })),
    ...archiefRecords,
  ].sort((a, b) => b.Date_checkin.getTime() - a.Date_checkin.getTime());
}
