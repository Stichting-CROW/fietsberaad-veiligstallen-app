/**
 * FMS locker methods: updateLocker, isAllowedToUse.
 * Mirrors ColdFusion BaseFMSService.
 */

import { prisma } from "~/server/db";
import { addTransactionToWachtrij } from "./wachtrij-service";
import { addSaldoToWachtrij } from "./wachtrij-service";
import { getLockerInfo } from "./fms-read-service";
import { getBikeparkByExternalID } from "../queue/bikepark-service";

const PLACE_STATUS = { FREE: 0, OCCUPIED: 1, BLOCKED: 2, RESERVED: 3, OUT_OF_ORDER: 4 } as const;

export type UpdateLockerInput = {
  statuscode: number;
  transactionDate?: string;
  transactionExpiryDate?: string;
  cost?: number;
  paymentTypeID?: number;
  typeCheck?: string;
};

/**
 * updateLocker – set locker status. Status 0 (FREE): checkout if parked. Status 1 (OCCUPIED): checkin if empty.
 * Status 2 (BLOCKED): block place. Status 4 (OUT_OF_ORDER): deactivate.
 */
export async function updateLocker(
  bikeparkID: string,
  sectionID: string,
  placeID: string,
  input: UpdateLockerInput
): Promise<{ status: number; message: string }> {
  const placeIdNum = parseInt(placeID, 10);
  if (Number.isNaN(placeIdNum)) {
    return { status: 0, message: "Unknown locker " + placeID };
  }

  const sectie = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionID,
      fietsenstalling: { StallingsID: bikeparkID, Status: "1" },
    },
    select: { sectieId: true },
  });
  if (!sectie) return { status: 0, message: "Unknown section " + sectionID };

  const place = await prisma.fietsenstalling_plek.findFirst({
    where: { id: BigInt(placeIdNum), sectie_id: BigInt(sectie.sectieId) },
    select: { id: true, status: true, isActief: true, isGeblokkeerd: true },
  });
  if (!place) return { status: 0, message: "Unknown locker " + placeID };

  const transactionDate = input.transactionDate ? new Date(input.transactionDate) : new Date();
  const cost = input.cost ?? 0;
  const typeCheck = input.typeCheck ?? "user";

  switch (input.statuscode) {
    case PLACE_STATUS.FREE: {
      const openTx = await prisma.transacties.findFirst({
        where: { PlaceID: place.id, Date_checkout: null },
        select: { PasID: true, Pastype: true },
      });
      if (openTx) {
        await addTransactionToWachtrij(
          bikeparkID,
          sectionID,
          {
            type: "Uit",
            typeCheck,
            transactionDate: transactionDate.toISOString(),
            passID: openTx.PasID,
            price: cost,
          },
          placeIdNum
        );
        if (cost > 0) {
          await addSaldoToWachtrij(bikeparkID, {
            passID: openTx.PasID,
            amount: cost,
            transactionDate: transactionDate.toISOString(),
            paymentTypeID: input.paymentTypeID ?? 1,
          });
        }
      } else if (cost > 0) {
        return { status: 0, message: "Kluis is al leeg. Betaling kan daarom niet verwerkt worden." };
      }
      await prisma.fietsenstalling_plek.update({
        where: { id: place.id },
        data: { status: PLACE_STATUS.FREE, dateLastStatusUpdate: transactionDate },
      });
      break;
    }
    case PLACE_STATUS.OCCUPIED: {
      await prisma.fietsenstalling_plek.update({
        where: { id: place.id },
        data: { isActief: true, isGeblokkeerd: false },
      });
      const openTx = await prisma.transacties.findFirst({
        where: { PlaceID: place.id, Date_checkout: null },
      });
      if (!openTx) {
        const dummyPassId = `${bikeparkID}_${sectionID}_${placeIdNum}`;
        await addTransactionToWachtrij(
          bikeparkID,
          sectionID,
          {
            type: "In",
            typeCheck,
            transactionDate: transactionDate.toISOString(),
            passID: dummyPassId,
            price: cost,
          },
          placeIdNum
        );
        if (cost > 0) {
          await addSaldoToWachtrij(bikeparkID, {
            passID: dummyPassId,
            amount: cost,
            transactionDate: transactionDate.toISOString(),
            paymentTypeID: input.paymentTypeID ?? 1,
          });
        }
        await prisma.fietsenstalling_plek.update({
          where: { id: place.id },
          data: { status: PLACE_STATUS.OCCUPIED, dateLastStatusUpdate: transactionDate },
        });
      } else if (cost > 0) {
        return { status: 0, message: "Kluis is al bezet. Betaling kan daarom niet verwerkt worden." };
      }
      break;
    }
    case PLACE_STATUS.BLOCKED:
      await prisma.fietsenstalling_plek.update({
        where: { id: place.id },
        data: { isGeblokkeerd: true, dateLastStatusUpdate: transactionDate },
      });
      break;
    case PLACE_STATUS.OUT_OF_ORDER:
      await prisma.fietsenstalling_plek.update({
        where: { id: place.id },
        data: { isActief: false, dateLastStatusUpdate: transactionDate },
      });
      break;
    case PLACE_STATUS.RESERVED:
      return { status: 0, message: "Status 3 (reserved) not yet implemented" };
    default:
      return { status: 0, message: "Invalid statuscode" };
  }
  return { status: 1, message: "OK" };
}

/**
 * isAllowedToUse – check if RFID/pass allowed to use locker.
 * Simplified: status 1 (occupied) → allowed if bike parked in this place matches pass; status 0 (free) → allowed if not parked elsewhere.
 */
export async function isAllowedToUse(
  bikeparkID: string,
  sectionID: string,
  placeID: string,
  rfid: string
): Promise<{ allowed: boolean; messageCode: string; saldo?: number }> {
  const locker = await getLockerInfo(bikeparkID, sectionID, placeID);
  const statusCode = locker.statuscode;

  if (statusCode === PLACE_STATUS.BLOCKED) return { allowed: false, messageCode: "BLOCKED" };
  if (statusCode === PLACE_STATUS.OUT_OF_ORDER) return { allowed: false, messageCode: "BLOCKED" };

  if (statusCode === PLACE_STATUS.OCCUPIED) {
    const userlist = locker.userlist ?? "";
    if (userlist && (userlist === rfid || userlist.toLowerCase() === rfid.toLowerCase())) {
      return { allowed: true, messageCode: "OK" };
    }
    return { allowed: false, messageCode: "RESERVED" };
  }

  if (statusCode === PLACE_STATUS.RESERVED) {
    return { allowed: false, messageCode: "RESERVED" };
  }

  const bikepark = await getBikeparkByExternalID(bikeparkID);
  if (!bikepark?.SiteID) return { allowed: false, messageCode: "INVALID_ID" };

  const pasid = await prisma.accounts_pasids.findFirst({
    where: {
      SiteID: bikepark.SiteID,
      OR: [{ RFID: rfid }, { RFIDBike: rfid }, { PasID: rfid }, { barcodeFiets: rfid }],
    },
    include: { accounts: { select: { saldo: true } } },
  });

  if (pasid) {
    const saldo = Number((pasid as { accounts?: { saldo: unknown } }).accounts?.saldo ?? 0);
    const parkedElsewhere = await prisma.transacties.findFirst({
      where: {
        PasID: pasid.PasID,
        Date_checkout: null,
        FietsenstallingID: { startsWith: bikepark.ZipID ?? "" },
      },
    });
    if (parkedElsewhere) {
      return { allowed: false, messageCode: "PARKED_ELSEWHERE" };
    }
    return { allowed: true, messageCode: "OK", saldo };
  }

  return { allowed: true, messageCode: "OK" };
}
