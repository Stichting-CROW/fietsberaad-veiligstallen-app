import { CONTACT } from "~/data/testgemeente-data";

export function citycodeFromLocationId(locationid: string): string {
  const prefix = locationid.split("_")[0] ?? "";
  return /^\d{4}$/.test(prefix) ? prefix : CONTACT.ZipID;
}

export function generateExternalTransactionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `SIM-MT-${Date.now()}-${rand}`;
}

export function stallingsduurMinutes(checkInIso: string, checkOutIso: string): number {
  const ms = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

export type SimCheckType = "user" | "controle" | "system";

export type ManagedSimTransaction = {
  externaltransactionid: string;
  idcode: string;
  idtype: number;
  checkindate: string;
  checkintype: SimCheckType;
  checkoutdate?: string;
  checkouttype?: SimCheckType;
  sectionid?: string;
  stallingsduur?: number;
  stallingskosten?: number;
  bikeid_in?: string;
  bikeid_out?: string;
  biketypeid?: number;
};

export function buildManagedCheckIn(input: {
  externaltransactionid: string;
  idcode: string;
  idtype?: number;
  checkindate: string;
  barcode: string;
  biketypeid?: number;
  checkintype?: SimCheckType;
  sectionid?: string;
}): ManagedSimTransaction {
  return {
    externaltransactionid: input.externaltransactionid,
    idcode: input.idcode,
    idtype: input.idtype ?? 0,
    checkindate: input.checkindate,
    checkintype: input.checkintype ?? "user",
    bikeid_in: input.barcode,
    biketypeid: input.biketypeid ?? 1,
    ...(input.sectionid ? { sectionid: input.sectionid } : {}),
  };
}

export function buildManagedCheckOut(input: {
  externaltransactionid: string;
  idcode: string;
  idtype?: number;
  checkindate: string;
  checkoutdate: string;
  barcode: string;
  biketypeid?: number;
  stallingskosten?: number;
  checkouttype?: SimCheckType;
  checkintype?: SimCheckType;
  sectionid?: string;
}): ManagedSimTransaction {
  return {
    ...buildManagedCheckIn(input),
    checkoutdate: input.checkoutdate,
    checkouttype: input.checkouttype ?? input.checkintype ?? "user",
    stallingsduur: stallingsduurMinutes(input.checkindate, input.checkoutdate),
    stallingskosten: input.stallingskosten ?? 0,
    bikeid_out: input.barcode,
  };
}
