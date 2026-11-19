import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
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
