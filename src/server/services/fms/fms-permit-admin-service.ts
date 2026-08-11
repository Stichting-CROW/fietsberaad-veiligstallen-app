/**
 * Admin CRUD for fmsservice_permit (ColdFusion: permissions/list.cfm + actions.cfm).
 */
import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import {
  formatPermitTypes,
  type VSFmsMissingCoupling,
  type VSFmsPermitEditorData,
  type VSFmsServicePermitRow,
} from "~/types/fms-permits";
import { VSContactItemType } from "~/types/contacts";

/** ColdFusion refreshRemote() — rebuild application.qDataproviders on the legacy FMS server. */
const LEGACY_FMS_REINIT_URL = "https://remote.veiligstallen.nl/?reinitdataproviders";

export async function notifyLegacyFmsReinit(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  try {
    const res = await fetch(LEGACY_FMS_REINIT_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function mapPermitRow(
  p: {
    ID: number;
    Permit: string | null;
    OperatorID: string | null;
    SiteID: string | null;
    BikeparkID: string | null;
    contacts_fmsservice_permit_OperatorIDTocontacts: {
      CompanyName: string | null;
    } | null;
    contacts_fmsservice_permit_SiteIDTocontacts: {
      CompanyName: string | null;
    } | null;
    fietsenstallingen: {
      StallingsID: string | null;
      Title: string | null;
      Type: string | null;
      FMS: boolean;
      fietsenstalling_type: {
        id: string;
        name: string | null;
      } | null;
    } | null;
  }
): VSFmsServicePermitRow {
  const gemeenteName =
    p.contacts_fmsservice_permit_SiteIDTocontacts?.CompanyName ?? null;
  let locationLabel: string | null = null;
  let stallingsID: string | null = null;

  if (p.BikeparkID && p.fietsenstallingen) {
    stallingsID = p.fietsenstallingen.StallingsID;
    const sid = p.fietsenstallingen.StallingsID ?? "";
    const title = p.fietsenstallingen.Title ?? "";
    locationLabel = `${sid} - ${title}`.trim();
  } else if (!p.BikeparkID && gemeenteName) {
    locationLabel = `Alle stallingen in ${gemeenteName}`;
  }

  return {
    ID: p.ID,
    Permit: p.Permit,
    OperatorID: p.OperatorID,
    SiteID: p.SiteID,
    BikeparkID: p.BikeparkID,
    operatorName: p.contacts_fmsservice_permit_OperatorIDTocontacts?.CompanyName ?? null,
    gemeenteName,
    locationLabel,
    stallingsID,
    parkingTypeId: p.fietsenstallingen?.Type ?? null,
    parkingTypeName: p.fietsenstallingen?.fietsenstalling_type?.name ?? null,
    fms: p.BikeparkID && p.fietsenstallingen ? p.fietsenstallingen.FMS : null,
  };
}

const permitInclude = {
  contacts_fmsservice_permit_OperatorIDTocontacts: {
    select: { CompanyName: true },
  },
  contacts_fmsservice_permit_SiteIDTocontacts: {
    select: { CompanyName: true },
  },
  fietsenstallingen: {
    select: {
      StallingsID: true,
      Title: true,
      Type: true,
      FMS: true,
      fietsenstalling_type: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.fmsservice_permitInclude;

export async function listPermitsForSite(siteID: string): Promise<VSFmsServicePermitRow[]> {
  const rows = await prisma.fmsservice_permit.findMany({
    where: { SiteID: siteID },
    include: permitInclude,
    orderBy: { ID: "asc" },
  });
  return rows
    .map(mapPermitRow)
    .sort((a, b) =>
      (a.operatorName ?? "").localeCompare(b.operatorName ?? "", "nl")
    );
}

export async function listAllPermits(): Promise<VSFmsServicePermitRow[]> {
  const rows = await prisma.fmsservice_permit.findMany({
    include: permitInclude,
    orderBy: [{ SiteID: "asc" }, { ID: "asc" }],
  });
  return rows
    .map(mapPermitRow)
    .sort((a, b) => {
      const g = (a.gemeenteName ?? "").localeCompare(b.gemeenteName ?? "", "nl");
      if (g !== 0) return g;
      const o = (a.operatorName ?? "").localeCompare(b.operatorName ?? "", "nl");
      if (o !== 0) return o;
      return (a.locationLabel ?? "").localeCompare(b.locationLabel ?? "", "nl");
    });
}

export async function listMissingCouplings(): Promise<VSFmsMissingCoupling[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      stallingsID: string | null;
      title: string | null;
      plaats: string | null;
      gemeenteName: string | null;
      siteID: string | null;
      parkingTypeId: string | null;
      parkingTypeName: string | null;
      fms: number | boolean;
    }>
  >`
    SELECT f.StallingsID AS stallingsID, f.Title AS title, f.Plaats AS plaats,
           c.CompanyName AS gemeenteName, f.SiteID AS siteID,
           f.Type AS parkingTypeId, t.name AS parkingTypeName,
           f.FMS AS fms
    FROM fietsenstallingen f
    INNER JOIN contacts c ON c.ID = f.SiteID
    LEFT JOIN fietsenstallingtypen t ON t.id = f.Type
    WHERE f.FMS = 1 AND f.Status = '1'
      AND f.Type IN ('bewaakt', 'geautomatiseerd')
      AND NOT EXISTS (
        SELECT 1 FROM fmsservice_permit p
        WHERE p.BikeparkID = f.ID AND LENGTH(COALESCE(p.Permit, '')) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM fmsservice_permit p
        WHERE p.SiteID = f.SiteID AND p.BikeparkID IS NULL
          AND LENGTH(COALESCE(p.Permit, '')) > 0
      )
    ORDER BY c.CompanyName, f.StallingsID
  `;
  return rows.map((row) => ({
    ...row,
    fms: Boolean(row.fms),
  }));
}

export async function getPermitEditorData(siteID: string): Promise<VSFmsPermitEditorData> {
  const [permits, dataproviders, fmsBikeparks, gemeente] = await Promise.all([
    listPermitsForSite(siteID),
    prisma.contacts.findMany({
      where: { ItemType: VSContactItemType.Dataprovider, Status: "1" },
      select: { ID: true, CompanyName: true },
      orderBy: { CompanyName: "asc" },
    }),
    prisma.fietsenstallingen.findMany({
      where: { SiteID: siteID, FMS: true, Status: "1" },
      select: { ID: true, StallingsID: true, Title: true },
      orderBy: { StallingsID: "asc" },
    }),
    prisma.contacts.findFirst({
      where: { ID: siteID },
      select: { CompanyName: true },
    }),
  ]);

  return {
    permits,
    dataproviders,
    fmsBikeparks,
    gemeenteName: gemeente?.CompanyName ?? null,
  };
}

async function permitForOperatorAllBikeparksExists(
  operatorID: string,
  siteID: string
): Promise<boolean> {
  const row = await prisma.fmsservice_permit.findFirst({
    where: { OperatorID: operatorID, SiteID: siteID, BikeparkID: null },
  });
  return row != null;
}

export class FmsPermitAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FmsPermitAdminError";
  }
}

export async function createFmsPermit(input: {
  operatorID: string;
  siteID: string;
  bikeparkID: string | null;
  permitTypes: string[];
}): Promise<{ row: VSFmsServicePermitRow; legacyRefreshed: boolean }> {
  const operator = await prisma.contacts.findFirst({
    where: { ID: input.operatorID, ItemType: VSContactItemType.Dataprovider },
    select: { CompanyName: true },
  });
  if (!operator) {
    throw new FmsPermitAdminError("Dataleverancier niet gevonden");
  }

  const gemeente = await prisma.contacts.findFirst({
    where: { ID: input.siteID },
    select: { CompanyName: true },
  });
  if (!gemeente) {
    throw new FmsPermitAdminError("Gemeente niet gevonden");
  }

  if (!input.bikeparkID) {
    if (
      await permitForOperatorAllBikeparksExists(input.operatorID, input.siteID)
    ) {
      throw new FmsPermitAdminError(
        `${operator.CompanyName ?? "Operator"} heeft al rechten voor alle stallingen in ${gemeente.CompanyName ?? "gemeente"}`
      );
    }
  } else {
    const bikepark = await prisma.fietsenstallingen.findFirst({
      where: { ID: input.bikeparkID, SiteID: input.siteID },
      select: { Title: true },
    });
    if (!bikepark) {
      throw new FmsPermitAdminError("Locatie niet gevonden");
    }
  }

  const permitStr = formatPermitTypes(input.permitTypes);

  try {
    const created = await prisma.fmsservice_permit.create({
      data: {
        OperatorID: input.operatorID,
        SiteID: input.siteID,
        BikeparkID: input.bikeparkID,
        Permit: permitStr,
      },
      include: permitInclude,
    });
    const legacyRefreshed = await notifyLegacyFmsReinit();
    return { row: mapPermitRow(created), legacyRefreshed };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const bikepark = input.bikeparkID
        ? await prisma.fietsenstallingen.findFirst({
            where: { ID: input.bikeparkID },
            select: { Title: true },
          })
        : null;
      throw new FmsPermitAdminError(
        `${operator.CompanyName ?? "Operator"} heeft al rechten voor locatie ${bikepark?.Title ?? "onbekend"}`
      );
    }
    throw e;
  }
}

export async function updateFmsPermit(
  id: number,
  permitTypes: string[]
): Promise<{ row: VSFmsServicePermitRow; legacyRefreshed: boolean }> {
  const permitStr = formatPermitTypes(permitTypes);
  const updated = await prisma.fmsservice_permit.update({
    where: { ID: id },
    data: { Permit: permitStr },
    include: permitInclude,
  });
  const legacyRefreshed = await notifyLegacyFmsReinit();
  return { row: mapPermitRow(updated), legacyRefreshed };
}

export async function deleteFmsPermit(
  id: number
): Promise<{ legacyRefreshed: boolean }> {
  await prisma.fmsservice_permit.delete({ where: { ID: id } });
  const legacyRefreshed = await notifyLegacyFmsReinit();
  return { legacyRefreshed };
}

export async function getPermitById(id: number): Promise<VSFmsServicePermitRow | null> {
  const row = await prisma.fmsservice_permit.findFirst({
    where: { ID: id },
    include: permitInclude,
  });
  return row ? mapPermitRow(row) : null;
}
