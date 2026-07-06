import type { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import {
  expandPermitString,
  serializePermitTypes,
  validatePermitTypes,
} from "~/types/fms-permit-types";

export type FmsPermitRow = {
  id: number;
  operatorId: string;
  operatorName: string;
  operatorUrlName: string | null;
  siteId: string;
  bikeparkId: string | null;
  stallingsId: string | null;
  bikeparkTitle: string | null;
  locationLabel: string;
  permitTypes: string[];
  permit: string | null;
};

export type FmsStallingOption = {
  id: string;
  stallingsId: string | null;
  title: string | null;
};

export async function listFmsPermitsForGemeente(siteId: string): Promise<{
  permits: FmsPermitRow[];
  fmsStallings: FmsStallingOption[];
}> {
  const [permits, fmsStallings] = await Promise.all([
    prisma.fmsservice_permit.findMany({
      where: { SiteID: siteId },
      include: {
        contacts_fmsservice_permit_OperatorIDTocontacts: {
          select: { ID: true, CompanyName: true, UrlName: true, ItemType: true },
        },
        fietsenstallingen: {
          select: { ID: true, StallingsID: true, Title: true },
        },
        contacts_fmsservice_permit_SiteIDTocontacts: {
          select: { CompanyName: true },
        },
      },
      orderBy: [{ OperatorID: "asc" }, { BikeparkID: "asc" }],
    }),
    prisma.fietsenstallingen.findMany({
      where: { SiteID: siteId, FMS: true, Status: "1" },
      select: { ID: true, StallingsID: true, Title: true },
      orderBy: { StallingsID: "asc" },
    }),
  ]);

  const gemeenteName =
    permits[0]?.contacts_fmsservice_permit_SiteIDTocontacts?.CompanyName ?? null;

  const rows: FmsPermitRow[] = permits.map((p) => {
    const operator = p.contacts_fmsservice_permit_OperatorIDTocontacts;
    const bikepark = p.fietsenstallingen;
    const permitTypes = expandPermitString(p.Permit);
    const locationLabel = bikepark
      ? `${bikepark.StallingsID ?? ""} - ${bikepark.Title ?? ""}`.trim()
      : gemeenteName
        ? `Alle stallingen in ${gemeenteName}`
        : "Alle stallingen in gemeente";

    return {
      id: p.ID,
      operatorId: p.OperatorID ?? "",
      operatorName: operator?.CompanyName ?? p.OperatorID ?? "",
      operatorUrlName: operator?.UrlName ?? null,
      siteId: p.SiteID ?? siteId,
      bikeparkId: p.BikeparkID,
      stallingsId: bikepark?.StallingsID ?? null,
      bikeparkTitle: bikepark?.Title ?? null,
      locationLabel,
      permitTypes,
      permit: p.Permit,
    };
  });

  return {
    permits: rows,
    fmsStallings: fmsStallings.map((s) => ({
      id: s.ID,
      stallingsId: s.StallingsID,
      title: s.Title,
    })),
  };
}

async function assertGemeente(siteId: string) {
  const gemeente = await prisma.contacts.findFirst({
    where: { ID: siteId, ItemType: "organizations" },
    select: { ID: true, CompanyName: true },
  });
  if (!gemeente) throw new Error("Gemeente niet gevonden");
  return gemeente;
}

async function assertDataprovider(operatorId: string) {
  const operator = await prisma.contacts.findFirst({
    where: { ID: operatorId, ItemType: "dataprovider", Status: "1" },
    select: { ID: true, CompanyName: true },
  });
  if (!operator) throw new Error("Dataleverancier niet gevonden of niet actief");
  return operator;
}

async function assertBikeparkForSite(siteId: string, bikeparkId: string) {
  const bikepark = await prisma.fietsenstallingen.findFirst({
    where: { ID: bikeparkId, SiteID: siteId, FMS: true },
    select: { ID: true },
  });
  if (!bikepark) throw new Error("FMS-stalling niet gevonden voor deze gemeente");
}

export async function createFmsPermit(input: {
  siteId: string;
  operatorId: string;
  bikeparkId: string | null;
  permitTypes: string[];
}) {
  const validationError = validatePermitTypes(input.permitTypes);
  if (validationError) throw new Error(validationError);

  await assertGemeente(input.siteId);
  await assertDataprovider(input.operatorId);

  const bikeparkId = input.bikeparkId?.trim() ? input.bikeparkId : null;
  if (bikeparkId) {
    await assertBikeparkForSite(input.siteId, bikeparkId);
  }

  const existing = await prisma.fmsservice_permit.findFirst({
    where: {
      OperatorID: input.operatorId,
      SiteID: input.siteId,
      BikeparkID: bikeparkId,
    },
  });
  if (existing) {
    throw new Error("Deze dataleverancier heeft al rechten voor deze locatie");
  }

  if (!bikeparkId) {
    const allSitesPermit = await prisma.fmsservice_permit.findFirst({
      where: {
        OperatorID: input.operatorId,
        SiteID: input.siteId,
        BikeparkID: null,
      },
    });
    if (allSitesPermit) {
      throw new Error("Deze dataleverancier heeft al rechten voor alle stallingen in deze gemeente");
    }
  }

  const permit = serializePermitTypes(input.permitTypes);
  return prisma.fmsservice_permit.create({
    data: {
      OperatorID: input.operatorId,
      SiteID: input.siteId,
      BikeparkID: bikeparkId,
      Permit: permit,
    },
  });
}

export async function updateFmsPermit(
  siteId: string,
  permitId: number,
  permitTypes: string[]
) {
  const validationError = validatePermitTypes(permitTypes);
  if (validationError) throw new Error(validationError);

  const existing = await prisma.fmsservice_permit.findFirst({
    where: { ID: permitId, SiteID: siteId },
  });
  if (!existing) throw new Error("Recht niet gevonden");

  return prisma.fmsservice_permit.update({
    where: { ID: permitId },
    data: { Permit: serializePermitTypes(permitTypes) },
  });
}

export async function deleteFmsPermit(siteId: string, permitId: number) {
  const existing = await prisma.fmsservice_permit.findFirst({
    where: { ID: permitId, SiteID: siteId },
  });
  if (!existing) throw new Error("Recht niet gevonden");
  await prisma.fmsservice_permit.delete({ where: { ID: permitId } });
}

export type PrismaTx = Prisma.TransactionClient;
