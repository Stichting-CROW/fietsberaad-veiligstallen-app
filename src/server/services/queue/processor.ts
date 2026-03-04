/**
 * Queue processor for new_wachtrij_* tables.
 * Mirrors ColdFusion processTransactions2.cfm.
 * Processing order: pasids (50) → transacties (50) → betalingen (200) → sync (1).
 */

import { prisma } from "~/server/db";
import { getBikeparkByExternalID, getBikeparkSectionByExternalID, getPlace } from "./bikepark-service";
import { getBikepassByPassId, addSaldoObject } from "./account-service";
import { putTransaction } from "./transaction-service";

const USE_NEW_TABLES = true;
const LIMIT_PASIDS = 50;
const LIMIT_TRANSACTIES = 50;
const LIMIT_BETALINGEN = 200;
const LIMIT_SYNC = 1;

/** 3-step locking: 0=waiting, 9=isolated, 8=locked, 1=success, 2=error */
const PROCESSED = { WAITING: 0, ISOLATED: 9, LOCKED: 8, SUCCESS: 1, ERROR: 2 } as const;

export type ProcessQueuesResult = {
  pasids: { processed: number; errors: number };
  transacties: { processed: number; errors: number };
  betalingen: { processed: number; errors: number };
  sync: { processed: number; errors: number };
};

type ProcessTransactiesResult = { processed: number; errors: number; latestProcessedTransactionDate: Date };

function parsePastypeFromBike(bike: unknown): string {
  if (!bike || typeof bike !== "object") return "sleutelhanger";
  const b = bike as Record<string, unknown>;
  const pt = b.pastype ?? b.passType ?? b.idtype;
  if (typeof pt === "string") return pt;
  if (typeof pt === "number") {
    if (pt === 1) return "ovchip";
    if (pt === 2) return "barcodebike";
  }
  return "sleutelhanger";
}

export async function processQueues(): Promise<ProcessQueuesResult> {
  const result: ProcessQueuesResult = {
    pasids: { processed: 0, errors: 0 },
    transacties: { processed: 0, errors: 0 },
    betalingen: { processed: 0, errors: 0 },
    sync: { processed: 0, errors: 0 },
  };

  await prisma.$transaction(async (tx) => {
    result.pasids = await processPasids(tx);
    const transactiesResult = await processTransacties(tx);
    result.transacties = { processed: transactiesResult.processed, errors: transactiesResult.errors };
    result.betalingen = await processBetalingen(tx);
    result.sync = await processSync(tx, transactiesResult.latestProcessedTransactionDate);
  });

  return result;
}

async function processPasids(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<{ processed: number; errors: number }> {
  const model = tx.new_wachtrij_pasids;

  // Step 1: Isolate – atomically mark batch 0→9
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_pasids SET processed = ? WHERE processed = ? AND (transactionDate IS NULL OR transactionDate <= NOW()) ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    LIMIT_PASIDS
  );

  // Step 2: Select isolated batch, Step 3: Lock 9→8
  const rows = await model.findMany({
    where: { processed: PROCESSED.ISOLATED },
    orderBy: { transactionDate: "asc" },
  });
  if (rows.length === 0) return { processed: 0, errors: 0 };

  await model.updateMany({
    where: { ID: { in: rows.map((r) => r.ID) } },
    data: { processed: PROCESSED.LOCKED },
  });

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const bikepark = await getBikeparkByExternalID(row.bikeparkID);
      if (!bikepark?.SiteID) {
        throw new Error(`Bikepark niet gevonden: ${row.bikeparkID}`);
      }

      let bike: unknown = null;
      try {
        bike = JSON.parse(row.bike);
      } catch {
        bike = {};
      }
      const pastype = parsePastypeFromBike(bike);

      const bikepass = await getBikepassByPassId(
        tx,
        row.passID,
        bikepark.SiteID,
        pastype,
        USE_NEW_TABLES
      );

      const pasidsModel = tx.new_accounts_pasids;
      await pasidsModel.update({
        where: { ID: bikepass.ID },
        data: {
          barcodeFiets: row.barcode || undefined,
          RFID: row.RFID || undefined,
          RFIDBike: row.RFIDBike || undefined,
          BikeTypeID: row.biketypeID ?? 1,
          dateLastIdUpdate: new Date(),
          dateModified: new Date(),
        },
      });

      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.SUCCESS, processDate: new Date() },
      });
      processed++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.ERROR, processDate: new Date(), error: errMsg },
      });
      errors++;
    }
  }

  return { processed, errors };
}

async function processTransacties(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<ProcessTransactiesResult> {
  const model = tx.new_wachtrij_transacties;

  // Step 1: Isolate – atomically mark batch 0→9
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_transacties SET processed = ? WHERE processed = ? AND (transactionDate IS NULL OR transactionDate <= NOW()) ORDER BY transactionDate ASC, type ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    LIMIT_TRANSACTIES
  );

  // Step 2: Select isolated batch, Step 3: Lock 9→8
  const rows = await model.findMany({
    where: { processed: PROCESSED.ISOLATED },
    orderBy: [{ transactionDate: "asc" }, { type: "asc" }],
  });
  if (rows.length === 0) {
    return { processed: 0, errors: 0, latestProcessedTransactionDate: new Date() };
  }

  await model.updateMany({
    where: { ID: { in: rows.map((r) => r.ID) } },
    data: { processed: PROCESSED.LOCKED },
  });

  let processed = 0;
  let errors = 0;
  let latestProcessedTransactionDate = new Date();

  for (const row of rows) {
    try {
      const bikepark = await getBikeparkByExternalID(row.bikeparkID);
      if (!bikepark?.SiteID) {
        throw new Error(`Bikepark niet gevonden: ${row.bikeparkID}`);
      }

      let transactionJson: Record<string, unknown> = {};
      try {
        transactionJson = JSON.parse(row.transaction) as Record<string, unknown>;
      } catch {
        /* use empty */
      }

      const passID = (row.passID || transactionJson.passID || transactionJson.idcode) as string;
      const passtype = (row.passtype || transactionJson.passType || transactionJson.passtype || "sleutelhanger") as string;
      const typeCheck = (row.typeCheck || transactionJson.typeCheck || "user") as string;
      const typeFixed = typeCheck === "section" ? "user" : typeCheck;
      const transactionDate = row.transactionDate ?? new Date(transactionJson.transactionDate as string);
      const type = (row.type === "Out" ? "Uit" : row.type) as "In" | "Uit";

      if (type !== "In" && type !== "Uit") {
        await model.update({
          where: { ID: row.ID },
          data: { processed: PROCESSED.ERROR, processDate: new Date(), error: `Onbekend type: ${row.type}` },
        });
        errors++;
        continue;
      }

      const section = await getBikeparkSectionByExternalID(row.sectionID);
      if (!section) {
        throw new Error(`Sectie niet gevonden: ${row.sectionID}`);
      }

      const bikepass = await getBikepassByPassId(
        tx,
        passID,
        bikepark.SiteID,
        passtype,
        USE_NEW_TABLES
      );

      const barcodeBike = (transactionJson.barcodeBike ?? transactionJson.bikeid ?? null) as string | null;
      const bikeTypeID = (transactionJson.bikeTypeID ?? transactionJson.bikeTypeId ?? 1) as number;
      const clientTypeID = (transactionJson.clientTypeID ?? transactionJson.clientTypeId ?? 1) as number;
      const price = row.price != null ? Number(row.price) : (transactionJson.price as number | undefined) ?? null;

      if (row.placeID != null || row.externalPlaceID) {
        const place = await getPlace(row.placeID ?? 0, row.sectionID);
        if (!place && row.placeID != null) {
          throw new Error(`Plek niet gevonden: ${row.placeID}`);
        }
      }

      await putTransaction(tx, {
        bikeparkID: row.bikeparkID,
        stallingID: bikepark.ID,
        siteID: bikepark.SiteID,
        sectionID: row.sectionID,
        sectionSectieId: section.sectieId,
        bikepass,
        type,
        typeCheck: typeFixed,
        transactionDate: transactionDate instanceof Date ? transactionDate : new Date(transactionDate),
        placeID: row.placeID ?? undefined,
        externalPlaceID: row.externalPlaceID ?? undefined,
        barcodeBike: barcodeBike ?? undefined,
        bikeTypeID,
        clientTypeID,
        price: price ?? undefined,
        zipID: bikepark.ZipID ?? undefined,
        exploitantID: bikepark.ExploitantID ?? undefined,
        berekentStallingskosten: bikepark.BerekentStallingskosten,
        useNewTables: USE_NEW_TABLES,
      });

      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.SUCCESS, processDate: new Date() },
      });
      processed++;
      latestProcessedTransactionDate = row.transactionDate ?? latestProcessedTransactionDate;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.ERROR, processDate: new Date(), error: errMsg },
      });
      errors++;
    }
  }

  return { processed, errors, latestProcessedTransactionDate };
}

async function processBetalingen(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<{ processed: number; errors: number }> {
  const model = tx.new_wachtrij_betalingen;

  // Step 1: Isolate – atomically mark batch 0→9
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_betalingen SET processed = ? WHERE processed = ? AND transactionDate <= NOW() ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    LIMIT_BETALINGEN
  );

  // Step 2: Select isolated batch, Step 3: Lock 9→8
  const rows = await model.findMany({
    where: { processed: PROCESSED.ISOLATED },
    orderBy: { transactionDate: "asc" },
  });
  if (rows.length === 0) return { processed: 0, errors: 0 };

  await model.updateMany({
    where: { ID: { in: rows.map((r) => r.ID) } },
    data: { processed: PROCESSED.LOCKED },
  });

  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const bikepark = await getBikeparkByExternalID(row.bikeparkID);
      if (!bikepark?.SiteID) {
        throw new Error(`Bikepark niet gevonden: ${row.bikeparkID}`);
      }

      await addSaldoObject(
        tx,
        row.passID,
        Number(row.amount),
        row.transactionDate,
        row.paymentTypeID,
        row.bikeparkID,
        bikepark.SiteID,
        USE_NEW_TABLES
      );

      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.SUCCESS, processDate: new Date() },
      });
      processed++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await model.update({
        where: { ID: row.ID },
        data: { processed: PROCESSED.ERROR, processDate: new Date(), error: errMsg },
      });
      errors++;
    }
  }

  return { processed, errors };
}

/**
 * Process wachtrij_sync. Uses latestProcessedTransactionDate from processTransacties (ColdFusion: processTransactions2.cfm lines 80, 146, 226).
 * ColdFusion: latestProcessedTransactionDate = now() when no wachtrij_transacties to process; else = last processed row's transactionDate.
 */
async function processSync(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  latestProcessedTransactionDate: Date
): Promise<{ processed: number; errors: number }> {
  const transactiesModel = tx.new_transacties;
  const model = tx.new_wachtrij_sync;

  // Step 1: Isolate – atomically mark one record 0→9 (only when transactionDate <= latest processed)
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_sync SET processed = ? WHERE processed = ? AND (transactionDate IS NULL OR transactionDate <= ?) ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    latestProcessedTransactionDate,
    LIMIT_SYNC
  );

  // Step 2: Select isolated record, Step 3: Lock 9→8
  const row = await model.findFirst({
    where: { processed: PROCESSED.ISOLATED },
    orderBy: { transactionDate: "asc" },
  });

  if (!row) return { processed: 0, errors: 0 };

  await model.update({
    where: { ID: row.ID },
    data: { processed: PROCESSED.LOCKED },
  });

  try {
    let bikes: Array<{ idcode?: string; bikeid?: string; idtype?: number; transactiondate?: string }> = [];
    try {
      bikes = JSON.parse(row.bikes) as typeof bikes;
    } catch {
      bikes = [];
    }

    const bikepark = await getBikeparkByExternalID(row.bikeparkID);
    if (!bikepark?.SiteID) {
      throw new Error(`Bikepark niet gevonden: ${row.bikeparkID}`);
    }

    const section = await getBikeparkSectionByExternalID(row.sectionID);
    if (!section) {
      throw new Error(`Sectie niet gevonden: ${row.sectionID}`);
    }

    const transactionDate = row.transactionDate ?? new Date();
    const pasidsModel = tx.new_accounts_pasids;

    const bikeIds = new Set(
      bikes.map((b) => (b.idcode ?? b.bikeid ?? "").toString().toLowerCase()).filter(Boolean)
    );

    const openInSection = await pasidsModel.findMany({
      where: {
        huidigeFietsenstallingId: row.bikeparkID,
        huidigeSectieId: row.sectionID,
      },
      select: { ID: true, PasID: true, Pastype: true, barcodeFiets: true, dateLastCheck: true },
    });

    for (const ap of openInSection) {
      const barcode = (ap.barcodeFiets ?? ap.PasID ?? "").toString().toLowerCase();
      if (bikeIds.has(barcode)) continue;
      if (ap.dateLastCheck && ap.dateLastCheck >= transactionDate) continue;

      const openTx = await transactiesModel.findFirst({
        where: {
          PasID: ap.PasID,
          SectieID: row.sectionID,
          Date_checkout: null,
        },
        orderBy: { Date_checkin: "desc" },
      });

      if (openTx) {
        const rawMinutes = Math.floor(
          (transactionDate.getTime() - openTx.Date_checkin.getTime()) / 60000
        );
        const stallingsduur = Math.max(0, Math.min(rawMinutes, 4294967295));
        await transactiesModel.update({
          where: { ID: openTx.ID },
          data: {
            Date_checkout: transactionDate,
            Type_checkout: "sync",
            SectieID_uit: row.sectionID,
            BarcodeFiets_uit: barcode || openTx.BarcodeFiets_uit,
            Stallingsduur: stallingsduur,
            dateModified: new Date(),
          },
        });
      }

      await pasidsModel.update({
        where: { ID: ap.ID },
        data: {
          huidigeFietsenstallingId: null,
          huidigeSectieId: null,
          dateModified: new Date(),
        },
      });
    }

    const parkedBarcodes = new Set(
      openInSection.map((ap) => (ap.barcodeFiets ?? ap.PasID ?? "").toString().toLowerCase()).filter(Boolean)
    );

    for (const bike of bikes) {
      const idcode = (bike.idcode ?? bike.bikeid ?? "").toString().toLowerCase();
      if (!idcode || parkedBarcodes.has(idcode)) continue;
      parkedBarcodes.add(idcode);

      const bikepass = await getBikepassByPassId(
        tx,
        idcode,
        bikepark.SiteID,
        bike.idtype === 1 ? "ovchip" : bike.idtype === 2 ? "barcodebike" : "sleutelhanger",
        USE_NEW_TABLES
      );

      await transactiesModel.create({
        data: {
          FietsenstallingID: bikepark.ID,
          SectieID: row.sectionID,
          PasID: bikepass.PasID,
          Pastype: bikepass.Pastype === "ovchip" ? 1 : bikepass.Pastype === "barcodebike" ? 2 : 0,
          Date_checkin: transactionDate,
          Type_checkin: "sync",
          BarcodeFiets_in: idcode,
          BikeTypeID: 1,
          ClientTypeID: 1,
          ZipID: bikepark.ZipID,
          ExploitantID: bikepark.ExploitantID,
        },
      });

      await pasidsModel.update({
        where: { ID: bikepass.ID },
        data: {
          huidigeFietsenstallingId: row.bikeparkID,
          huidigeSectieId: row.sectionID,
          barcodeFiets: idcode,
          dateLastCheck: transactionDate,
          typeLastCheckin: "sync",
          dateModified: new Date(),
        },
      });
    }

    await model.update({
      where: { ID: row.ID },
      data: { processed: 1, processDate: new Date() },
    });

    return { processed: 1, errors: 0 };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await model.update({
      where: { ID: row.ID },
      data: { processed: 2, processDate: new Date(), error: errMsg },
    });
    return { processed: 0, errors: 1 };
  }
}
