import { prisma } from "~/server/db";

export type BikeType = {
  bikeTypeID: number;
  name: string;
  naamenkelvoud: string;
};

export type PaymentType = {
  paymentTypeID: number;
  name: string;
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

export async function getPaymentTypes(): Promise<PaymentType[]> {
  return [
    { paymentTypeID: 1, name: "betaald" },
    { paymentTypeID: 2, name: "kwijtschelding" },
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
