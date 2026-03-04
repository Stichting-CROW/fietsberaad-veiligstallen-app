/**
 * Update bezettingsdata service – port of ColdFusion updateTableBezettingsdata.cfm.
 * Populates bezettingsdata from:
 * - Lumiguide: bezettingsdata_tmp → bezettingsdata
 * - FMS: transacties → bezettingsdata (checkins/checkouts per 15-min interval, occupation backfill)
 *
 * Column definitions: see docs/analyse-motorblok/QUEUE_PROCESSOR_PORTING_PLAN.md Appendix L.
 */

import { prisma } from "~/server/db";

const INTERVAL_MINUTES = 15;
const SOURCE_FMS = "FMS";

export interface UpdateBezettingsdataParams {
  useNewTables?: boolean;
  dateStart?: Date;
  dateEnd?: Date;
  siteID?: string | null;
}

export interface UpdateBezettingsdataResult {
  lumiguideRows: number;
  fmsRows: number;
  fmsSectionsProcessed: number;
}

/**
 * Generate 15-minute interval timestamps between dateStart and dateEnd (inclusive).
 */
function generateIntervalTimestamps(dateStart: Date, dateEnd: Date): Date[] {
  const timestamps: Date[] = [];
  const current = new Date(dateStart);
  current.setSeconds(0, 0);
  const end = new Date(dateEnd);
  while (current <= end) {
    timestamps.push(new Date(current));
    current.setMinutes(current.getMinutes() + INTERVAL_MINUTES);
  }
  return timestamps;
}

/**
 * Process Lumiguide path: copy bezettingsdata_tmp (or new_bezettingsdata_tmp) → bezettingsdata (or new_bezettingsdata),
 * backfill occupation, TRUNCATE tmp.
 */
async function processLumiguidePath(useNewTables: boolean): Promise<number> {
  const tmpRows = useNewTables
    ? await prisma.new_bezettingsdata_tmp.findMany({
        where: {
          bikeparkID: { not: null },
          sectionID: { not: null },
        },
      })
    : await prisma.bezettingsdata_tmp.findMany({
        where: {
          bikeparkID: { not: null },
          sectionID: { not: null },
        },
      });
  if (tmpRows.length === 0) return 0;

  let inserted = 0;
  for (const row of tmpRows) {
    const tsStart = row.timestampStartInterval ?? row.timestamp;
    const ts = row.timestamp;
    const src = row.source ?? "Lumiguide";
    const bpId = row.bikeparkID;
    const secId = row.sectionID;
    if (!ts || !bpId || !secId) continue;

    const createData = {
      timestampStartInterval: tsStart,
      timestamp: ts,
      interval: row.interval,
      source: src,
      bikeparkID: bpId,
      sectionID: secId,
      brutoCapacity: row.brutoCapacity,
      capacity: row.capacity,
      bulkreserveration: row.bulkreserveration ?? 0,
      occupation: row.occupation,
      checkins: row.checkins,
      checkouts: row.checkouts,
      open: row.open,
      fillup: false,
      rawData: row.rawData ? row.rawData.substring(0, 255) : null,
    };
    const updateData = {
      brutoCapacity: row.brutoCapacity,
      capacity: row.capacity,
      bulkreserveration: row.bulkreserveration ?? 0,
      occupation: row.occupation,
      checkins: row.checkins,
      checkouts: row.checkouts,
      open: row.open,
      rawData: row.rawData ? row.rawData.substring(0, 255) : null,
    };

    if (useNewTables) {
      await prisma.new_bezettingsdata.upsert({
        where: {
          timestampStartInterval_timestamp_source_bikeparkID_sectionID: {
            timestampStartInterval: tsStart,
            timestamp: ts,
            source: src,
            bikeparkID: bpId,
            sectionID: secId,
          },
        },
        create: createData,
        update: updateData,
      });
    } else {
      await prisma.bezettingsdata.upsert({
        where: {
          timestampStartInterval_timestamp_source_bikeparkID_sectionID: {
            timestampStartInterval: tsStart,
            timestamp: ts,
            source: src,
            bikeparkID: bpId,
            sectionID: secId,
          },
        },
        create: createData,
        update: updateData,
      });
    }
    inserted++;
  }

  // Backfill occupation for NULL rows (Lumiguide: getOccupation_from_bezettingsdata)
  const sections = [...new Set(tmpRows.map((r) => ({ sectionID: r.sectionID!, source: r.source ?? "Lumiguide" })))];
  if (useNewTables) {
    for (const { sectionID, source } of sections) {
      const nullRows = await prisma.new_bezettingsdata.findMany({
        where: { sectionID, source, occupation: null },
        orderBy: { timestamp: "asc" },
      });
      for (const row of nullRows) {
        const prev = await prisma.new_bezettingsdata.findFirst({
          where: {
            sectionID,
            source,
            timestamp: { lte: row.timestamp },
            occupation: { not: null },
          },
          orderBy: { timestamp: "desc" },
        });
        const occ = prev?.occupation ?? 0;
        await prisma.new_bezettingsdata.update({
          where: { ID: row.ID },
          data: { occupation: occ },
        });
      }
    }
    await prisma.new_bezettingsdata_tmp.deleteMany({});
  } else {
    for (const { sectionID, source } of sections) {
      const nullRows = await prisma.bezettingsdata.findMany({
        where: { sectionID, source, occupation: null },
        orderBy: { timestamp: "asc" },
      });
      for (const row of nullRows) {
        const prev = await prisma.bezettingsdata.findFirst({
          where: {
            sectionID,
            source,
            timestamp: { lte: row.timestamp },
            occupation: { not: null },
          },
          orderBy: { timestamp: "desc" },
        });
        const occ = prev?.occupation ?? 0;
        await prisma.bezettingsdata.update({
          where: { ID: row.ID },
          data: { occupation: occ },
        });
      }
    }
    await prisma.bezettingsdata_tmp.deleteMany({});
  }
  return inserted;
}

/**
 * Process FMS path: aggregate checkins/checkouts from transacties, insert rows, run occupation backfill.
 */
async function processFmsPath(
  params: UpdateBezettingsdataParams
): Promise<{ rows: number; sectionsProcessed: number }> {
  const transactiesTable = params.useNewTables ? "new_transacties" : "transacties";
  const dateEnd = params.dateEnd ?? new Date();
  const dateStart = params.dateStart ?? new Date(dateEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const startStr = dateStart.toISOString().slice(0, 19).replace("T", " ");
  const endStr = dateEnd.toISOString().slice(0, 19).replace("T", " ");

  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: {
      isactief: true,
      externalId: { not: null },
      fietsenstalling: {
        BronBezettingsdata: SOURCE_FMS,
        ...(params.siteID ? { SiteID: params.siteID } : {}),
      },
    },
    select: {
      externalId: true,
      fietsenstalling: { select: { StallingsID: true } },
    },
  });

  const validSections = sections.filter(
    (s) => s.externalId && s.fietsenstalling?.StallingsID
  ) as Array<{
    externalId: string;
    fietsenstalling: { StallingsID: string };
  }>;

  if (validSections.length === 0) {
    return { rows: 0, sectionsProcessed: 0 };
  }

  const timestamps = generateIntervalTimestamps(dateStart, dateEnd);
  let totalRows = 0;

  for (const section of validSections) {
    const sectionID = section.externalId!;
    const bikeparkID = section.fietsenstalling.StallingsID;

    for (const ts of timestamps) {
      const tsNext = new Date(ts.getTime() + INTERVAL_MINUTES * 60 * 1000);
      const tsStr = ts.toISOString().slice(0, 19).replace("T", " ");
      const tsNextStr = tsNext.toISOString().slice(0, 19).replace("T", " ");

      const checkinsResult = await prisma.$queryRawUnsafe<[{ cnt: bigint }]>(
        `SELECT COUNT(*) as cnt FROM ${transactiesTable} WHERE SectieID = ? AND Date_checkin >= ? AND Date_checkin < ? AND (Type_checkin IS NULL OR Type_checkin != 'sync')`,
        sectionID,
        tsStr,
        tsNextStr
      );
      const checkoutsResult = await prisma.$queryRawUnsafe<[{ cnt: bigint }]>(
        `SELECT COUNT(*) as cnt FROM ${transactiesTable} WHERE SectieID = ? AND Date_checkout IS NOT NULL AND Date_checkout >= ? AND Date_checkout < ? AND (Type_checkout IS NULL OR Type_checkout != 'sync')`,
        sectionID,
        tsStr,
        tsNextStr
      );

      const checkins = Number(checkinsResult[0]?.cnt ?? 0);
      const checkouts = Number(checkoutsResult[0]?.cnt ?? 0);

      const upsertData = {
        create: {
          timestampStartInterval: ts,
          timestamp: ts,
          interval: INTERVAL_MINUTES,
          source: SOURCE_FMS,
          bikeparkID,
          sectionID,
          checkins,
          checkouts,
          fillup: false,
        },
        update: { checkins, checkouts },
      };

      if (params.useNewTables) {
        await prisma.new_bezettingsdata.upsert({
          where: {
            timestampStartInterval_timestamp_source_bikeparkID_sectionID: {
              timestampStartInterval: ts,
              timestamp: ts,
              source: SOURCE_FMS,
              bikeparkID,
              sectionID,
            },
          },
          ...upsertData,
        });
      } else {
        await prisma.bezettingsdata.upsert({
          where: {
            timestampStartInterval_timestamp_source_bikeparkID_sectionID: {
              timestampStartInterval: ts,
              timestamp: ts,
              source: SOURCE_FMS,
              bikeparkID,
              sectionID,
            },
          },
          ...upsertData,
        });
      }
      totalRows++;
    }

    const occupation = await prisma.$queryRawUnsafe<[{ cnt: bigint }]>(
      `SELECT COUNT(*) as cnt FROM ${transactiesTable} WHERE SectieID = ? AND Date_checkin <= ? AND (Date_checkout IS NULL OR Date_checkout > ?) AND (Type_checkin IS NULL OR Type_checkin != 'sync') AND (Type_checkout IS NULL OR Type_checkout != 'sync')`,
      sectionID,
      startStr,
      startStr
    );
    let runningOcc = Number(occupation[0]?.cnt ?? 0);

    const rowsToUpdate = params.useNewTables
      ? await prisma.new_bezettingsdata.findMany({
          where: {
            sectionID,
            source: SOURCE_FMS,
            timestamp: { gte: dateStart },
          },
          orderBy: { timestamp: "asc" },
        })
      : await prisma.bezettingsdata.findMany({
          where: {
            sectionID,
            source: SOURCE_FMS,
            timestamp: { gte: dateStart },
          },
          orderBy: { timestamp: "asc" },
        });

    for (const row of rowsToUpdate) {
      const checkins = row.checkins ?? 0;
      const checkouts = row.checkouts ?? 0;
      runningOcc = runningOcc + checkins - checkouts;
      if (params.useNewTables) {
        await prisma.new_bezettingsdata.update({
          where: { ID: row.ID },
          data: { occupation: runningOcc },
        });
      } else {
        await prisma.bezettingsdata.update({
          where: { ID: row.ID },
          data: { occupation: runningOcc },
        });
      }
    }
  }

  return { rows: totalRows, sectionsProcessed: validSections.length };
}

/**
 * Run update bezettingsdata (Lumiguide + FMS paths).
 */
export async function updateBezettingsdata(
  params: UpdateBezettingsdataParams = {}
): Promise<UpdateBezettingsdataResult> {
  const useNewTables = params.useNewTables ?? false;
  const lumiguideRows = await processLumiguidePath(useNewTables);
  const fms = await processFmsPath(params);

  return {
    lumiguideRows,
    fmsRows: fms.rows,
    fmsSectionsProcessed: fms.sectionsProcessed,
  };
}
