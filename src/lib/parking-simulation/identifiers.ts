/**
 * Bicycle and Pass identifier helpers.
 * Map abstract identifiers to REST API fields.
 */

import type { BicycleIdentifier, PassIdentifier } from "./types";

export function toRestBicycleId(id: BicycleIdentifier): Record<string, string | undefined> {
  if (id.method === "barcode") {
    return { barcode: id.value, barcodeBike: id.value, bikeid: id.value };
  }
  return { RFIDBike: id.value };
}

export function toRestPassId(id: PassIdentifier): Record<string, string | number | undefined> {
  const base = id.method === "barcode" ? { passID: id.value, idcode: id.value } : { RFID: id.value };
  if (id.idtype != null) base.idtype = id.idtype;
  return base;
}

export function fromDbBicycleId(barcode: string | null, rfidBike: string | null): BicycleIdentifier | null {
  if (barcode) return { method: "barcode", value: barcode };
  if (rfidBike) return { method: "rfid", value: rfidBike };
  return null;
}

export function fromDbPassId(passID: string | null, rfid: string | null, idtype?: number): PassIdentifier | null {
  if (passID) return { method: "barcode", value: passID, idtype };
  if (rfid) return { method: "rfid", value: rfid, idtype };
  return null;
}
