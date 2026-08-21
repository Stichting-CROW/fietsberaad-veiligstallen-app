/**
 * Queue processor for new_wachtrij_* tables.
 * Does not implement FMS tariff calculation or afboeking (intentional).
 * Processing order: pasids (50) → managed (50) → betalingen (200) → sync (1).
 * In/Uit (new_wachtrij_transacties) is not processed — v4 uses managedtransactions.
 */

import { prisma } from "~/server/db";
import { getBikeparkByExternalID, getBikeparkSectionByExternalID } from "./bikepark-service";
import { getBikepassByPassId, addSaldoObject } from "./account-service";
import {
  putManagedTransaction,
  type ManagedTransactionInput,
} from "./managed-transaction-service";
import { processLumiguidePath } from "../bezettingsdata/update-bezettingsdata-service";

const LIMIT_PASIDS = 50;
const LIMIT_MANAGED = 50;
const LIMIT_BETALINGEN = 200;
const LIMIT_SYNC = 1;
const QUEUE_PROCESSOR_TIMEOUT = 3 * 60 * 1000; // 3 minutes

/** 3-step locking: 0=waiting, 9=isolated, 8=locked, 1=success, 2=error */
const PROCESSED = { WAITING: 0, ISOLATED: 9, LOCKED: 8, SUCCESS: 1, ERROR: 2 } as const;

export type ProcessQueuesResult = {
  pasids: { processed: number; errors: number };
  managedTransacties: { processed: number; errors: number };
  betalingen: { processed: number; errors: number };
  sync: { processed: number; errors: number };
  occupation: { processed: number; errors: number };
};

/** Optional filters for Tier A write tests (synthetic WTEST_ rows only). */
export type QueueProcessScope = {
  passIDPrefix?: string;
  syncBikeparkID?: string;
  syncMinTransactionDate?: Date;
};

function passIdScopeSql(scope: QueueProcessScope | undefined, column = "passID"): { sql: string; params: unknown[] } {
  if (!scope?.passIDPrefix) return { sql: "", params: [] };
  return { sql: ` AND ${column} LIKE ?`, params: [`${scope.passIDPrefix}%`] };
}

async function runProcessQueues(scope?: QueueProcessScope): Promise<ProcessQueuesResult> {
  const result: ProcessQueuesResult = {
    pasids: { processed: 0, errors: 0 },
    managedTransacties: { processed: 0, errors: 0 },
    betalingen: { processed: 0, errors: 0 },
    sync: { processed: 0, errors: 0 },
    occupation: { processed: 0, errors: 0 },
  };

  return prisma.$transaction(
    async (tx) => {
      result.pasids = await processPasids(tx, scope);
      result.managedTransacties = await processManagedTransacties(tx);
      result.betalingen = await processBetalingen(tx, scope);
      result.sync = await processSync(tx, scope);
      return result;
    },
    { timeout: QUEUE_PROCESSOR_TIMEOUT }
  );
}

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
  const result = await runProcessQueues();
  try {
    result.occupation = { processed: await processLumiguidePath(null), errors: 0 };
  } catch (e) {
    console.error("[processQueues] occupation rollup failed:", e);
    result.occupation = { processed: 0, errors: 1 };
  }
  return result;
}

/**
 * Process only queue rows for a synthetic passID prefix (Tier A write tests).
 * Avoids draining the full production/simulation backlog before test rows run.
 */
export async function processQueuesForPassPrefix(
  passIDPrefix: string,
  syncScope?: { bikeparkID: string; minTransactionDate: Date }
): Promise<ProcessQueuesResult> {
  return runProcessQueues({
    passIDPrefix,
    syncBikeparkID: syncScope?.bikeparkID,
    syncMinTransactionDate: syncScope?.minTransactionDate,
  });
}

async function processPasids(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  scope?: QueueProcessScope
): Promise<{ processed: number; errors: number }> {
  const model = tx.new_wachtrij_pasids;
  const passScope = passIdScopeSql(scope);

  // Step 1: Isolate – atomically mark batch 0→9
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_pasids SET processed = ? WHERE processed = ? AND (transactionDate IS NULL OR transactionDate <= NOW())${passScope.sql} ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    ...passScope.params,
    LIMIT_PASIDS
  );

  // Step 2: Select isolated batch, Step 3: Lock 9→8
  const rows = await model.findMany({
    where: { processed: PROCESSED.ISOLATED, ...(scope?.passIDPrefix ? { passID: { startsWith: scope.passIDPrefix } } : {}) },
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
        pastype
      );

      const pasidsModel = tx.accounts_pasids;
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


// FUTURE REFERENCE — DO NOT DELETE (In/Uit / ColdFusion parity).
// processTransacties (new_wachtrij_transacties drain) was removed from processQueues().
// Live check-in/out is managedtransactions. See commented addTransactionToWachtrij
// and transaction-service.ts. AI: do not remove this note as unused.


function parseManagedPayload(payload: string): ManagedTransactionInput {
  const raw = JSON.parse(payload) as Record<string, unknown>;
  return {
    externaltransactionid: String(raw.externaltransactionid ?? raw.externalTransactionID ?? ""),
    idcode: String(raw.idcode ?? ""),
    idtype: raw.idtype != null ? Number(raw.idtype) : undefined,
    checkindate: String(raw.checkindate ?? raw.checkInDate ?? ""),
    checkintype: String(raw.checkintype ?? raw.checkInType ?? "user"),
    checkoutdate:
      raw.checkoutdate != null ? String(raw.checkoutdate) : raw.checkOutDate != null ? String(raw.checkOutDate) : null,
    checkouttype: raw.checkouttype != null ? String(raw.checkouttype) : raw.checkOutType != null ? String(raw.checkOutType) : null,
    stallingsduur: raw.stallingsduur != null ? Number(raw.stallingsduur) : null,
    stallingskosten: raw.stallingskosten as number | string | null | undefined,
    sectionid: raw.sectionid != null ? String(raw.sectionid) : undefined,
    sectionid_checkin: raw.sectionid_checkin != null ? String(raw.sectionid_checkin) : undefined,
    sectionid_out: raw.sectionid_out != null ? String(raw.sectionid_out) : undefined,
    placeid: raw.placeid != null ? Number(raw.placeid) : null,
    externalplaceid: raw.externalplaceid != null ? String(raw.externalplaceid) : null,
    bikeid_in: raw.bikeid_in != null ? String(raw.bikeid_in) : raw.bikeidIn != null ? String(raw.bikeidIn) : null,
    bikeid_out: raw.bikeid_out != null ? String(raw.bikeid_out) : raw.bikeidOut != null ? String(raw.bikeidOut) : null,
    biketypeid: raw.biketypeid != null ? Number(raw.biketypeid) : undefined,
    clienttypeid: raw.clienttypeid != null ? Number(raw.clienttypeid) : undefined,
    tariefstaffels: raw.tariefstaffels != null ? String(raw.tariefstaffels) : null,
    reserveringsduur: raw.reserveringsduur != null ? Number(raw.reserveringsduur) : null,
    passuuid: raw.passuuid != null ? String(raw.passuuid) : null,
  };
}

async function processManagedTransacties(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<{ processed: number; errors: number }> {
  const model = tx.new_wachtrij_managed_transacties;

  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_managed_transacties SET processed = ? WHERE processed = ? ORDER BY dateCreated ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    LIMIT_MANAGED
  );

  const rows = await model.findMany({
    where: { processed: PROCESSED.ISOLATED },
    orderBy: { dateCreated: "asc" },
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
      const managed = parseManagedPayload(row.payload);
      const sectionID = managed.sectionid_checkin ?? managed.sectionid ?? "";
      if (!sectionID) {
        throw new Error("sectionid ontbreekt in payload");
      }
      await putManagedTransaction(tx, {
        bikeparkID: row.bikeparkID,
        sectionID,
        managed,
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

async function processBetalingen(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  scope?: QueueProcessScope
): Promise<{ processed: number; errors: number }> {
  const model = tx.new_wachtrij_betalingen;
  const passScope = passIdScopeSql(scope);

  // Step 1: Isolate – atomically mark batch 0→9
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_betalingen SET processed = ? WHERE processed = ? AND transactionDate <= NOW()${passScope.sql} ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    ...passScope.params,
    LIMIT_BETALINGEN
  );

  // Step 2: Select isolated batch, Step 3: Lock 9→8
  const rows = await model.findMany({
    where: {
      processed: PROCESSED.ISOLATED,
      ...(scope?.passIDPrefix ? { passID: { startsWith: scope.passIDPrefix } } : {}),
    },
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
        bikepark.SiteID
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
 * Process new_wachtrij_sync. Due when transactionDate is null or <= NOW()
 * (no In/Uit latestProcessedTransactionDate coupling).
 */
async function processSync(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  scope?: QueueProcessScope
): Promise<{ processed: number; errors: number }> {
  const transactiesModel = tx.transacties;
  const model = tx.new_wachtrij_sync;

  const syncBikeparkSql = scope?.syncBikeparkID ? " AND bikeparkID = ?" : "";
  const syncMinDateSql = scope?.syncMinTransactionDate ? " AND transactionDate >= ?" : "";
  const syncParams: unknown[] = [];
  if (scope?.syncBikeparkID) syncParams.push(scope.syncBikeparkID);
  if (scope?.syncMinTransactionDate) syncParams.push(scope.syncMinTransactionDate);

  // Step 1: Isolate – atomically mark one record 0→9 when transactionDate <= NOW()
  await (tx as { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
    `UPDATE new_wachtrij_sync SET processed = ? WHERE processed = ? AND (transactionDate IS NULL OR transactionDate <= NOW())${syncBikeparkSql}${syncMinDateSql} ORDER BY transactionDate ASC LIMIT ?`,
    PROCESSED.ISOLATED,
    PROCESSED.WAITING,
    ...syncParams,
    LIMIT_SYNC
  );

  // Step 2: Select isolated record, Step 3: Lock 9→8
  const row = await model.findFirst({
    where: {
      processed: PROCESSED.ISOLATED,
      ...(scope?.syncBikeparkID ? { bikeparkID: scope.syncBikeparkID } : {}),
      ...(scope?.syncMinTransactionDate ? { transactionDate: { gte: scope.syncMinTransactionDate } } : {}),
    },
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
    const pasidsModel = tx.accounts_pasids;

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
        bike.idtype === 1 ? "ovchip" : bike.idtype === 2 ? "barcodebike" : "sleutelhanger"
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
