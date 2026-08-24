import { prisma } from "~/server/db";

export type BikeType = {
  bikeTypeID: number;
  name: string;
  naamenkelvoud: string;
};

export type PaymentType = {
  paymentTypeID: number;
  name: string;
  description: string;
};

export type ClientType = {
  clientTypeID: number;
  name: string;
};

export async function getServerTime(): Promise<string> {
  return new Date().toISOString();
}

export async function getBikeTypes(): Promise<BikeType[]> {
  const rows = await prisma.fietstypen.findMany({
    orderBy: { ID: "asc" },
    select: { ID: true, Name: true, naamenkelvoud: true },
  });
  return rows.map((r) => ({
    bikeTypeID: r.ID,
    name: r.Name ?? "",
    naamenkelvoud: r.naamenkelvoud,
  }));
}

/**
 * Single bike type by id.
 * ColdFusion BaseFMSService.getBikeType → proxy.BikeType { bikeTypeID, name }.
 */
export async function getBikeType(bikeTypeID: number): Promise<BikeType | null> {
  const row = await prisma.fietstypen.findFirst({
    where: { ID: bikeTypeID },
    select: { ID: true, Name: true, naamenkelvoud: true },
  });
  if (!row) return null;
  return {
    bikeTypeID: row.ID,
    name: row.Name ?? "",
    naamenkelvoud: row.naamenkelvoud,
  };
}

export async function getPaymentTypes(): Promise<PaymentType[]> {
  return [
    {
      paymentTypeID: 1,
      name: "Fysieke betaling/restitutie",
      description:
        "Klant heeft betaald in de stalling. Bij een negatief bedrag betekent deze code dat de klant geld heeft teruggekregen van de beheerder (restitutie)",
    },
    {
      paymentTypeID: 2,
      name: "Kwijtschelding",
      description:
        "Beheerder heeft stallingsschuld kwijtgescholden. Louter administratieve handeling. Geen fysiek geld betrokken.",
    },
  ];
}

export async function getClientTypes(): Promise<ClientType[]> {
  const rows = await prisma.klanttypen.findMany({
    orderBy: { ID: "asc" },
    select: { ID: true, Name: true },
  });
  return rows.map((r) => ({
    clientTypeID: r.ID,
    name: r.Name ?? "",
  }));
}
