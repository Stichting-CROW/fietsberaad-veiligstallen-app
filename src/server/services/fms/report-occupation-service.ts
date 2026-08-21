/**
 * reportOccupationData / reportJsonOccupationData service.
 * Writes Lumiguide (or external) occupation data to new_bezettingsdata_tmp
 * (Next.js input queue) and fietsenstalling_sectie.Bezetting.
 * ColdFusion keeps bezettingsdata_tmp. Next.js rollup copies new_* → bezettingsdata.
 *
 * Write path: docs/analyse-api/fms-write-paths.md.
 */

import { prisma } from "~/server/db";

const DEFAULT_SOURCE = "Lumiguide";
const DEFAULT_INTERVAL = 15;

export interface ReportOccupationPayload {
  timestamp?: string | Date;
  occupation: number;
  capacity?: number;
  checkins?: number;
  checkouts?: number;
  open?: boolean;
  interval?: number;
  source?: string;
  rawData?: string;
}

/** Round timestamp down to interval start (e.g. 10:07 with interval 15 → 10:00). */
function roundToIntervalStart(ts: Date, intervalMinutes: number): Date {
  const ms = ts.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(ms / intervalMs) * intervalMs);
}

/**
 * Report occupation data for a section. Writes to new_bezettingsdata_tmp and fietsenstalling_sectie.Bezetting.
 */
export async function reportOccupationData(
  bikeparkID: string,
  sectionID: string,
  payload: ReportOccupationPayload
): Promise<{ ok: boolean; tmpId?: number }> {
  const rawTs = payload.timestamp ? new Date(payload.timestamp) : new Date();
  const interval = payload.interval ?? DEFAULT_INTERVAL;
  const timestamp = roundToIntervalStart(rawTs, interval);
  const source = payload.source ?? DEFAULT_SOURCE;

  const section = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionID,
      fietsenstalling: {
        StallingsID: bikeparkID,
      },
    },
    select: { sectieId: true },
  });

  if (!section) {
    throw new Error(`Section ${sectionID} not found for bikepark ${bikeparkID}`);
  }

  const createData = {
    timestamp,
    timestampStartInterval: timestamp,
    interval,
    source,
    bikeparkID,
    sectionID,
    occupation: payload.occupation,
    capacity: payload.capacity ?? null,
    checkins: payload.checkins ?? null,
    checkouts: payload.checkouts ?? null,
    open: payload.open ?? null,
    rawData: payload.rawData ? payload.rawData.substring(0, 65535) : null,
  };
  const updateData = {
    occupation: payload.occupation,
    capacity: payload.capacity ?? undefined,
    checkins: payload.checkins ?? undefined,
    checkouts: payload.checkouts ?? undefined,
    open: payload.open ?? undefined,
    rawData: payload.rawData ? payload.rawData.substring(0, 65535) : undefined,
  };

  const tmpRow = await prisma.new_bezettingsdata_tmp.upsert({
    where: {
      timestamp_interval_source_bikeparkID_sectionID: {
        timestamp,
        interval,
        source,
        bikeparkID,
        sectionID,
      },
    },
    create: createData,
    update: updateData,
  });

  await prisma.fietsenstalling_sectie.update({
    where: { sectieId: section.sectieId },
    data: { Bezetting: payload.occupation },
  });

  return { ok: true, tmpId: tmpRow.ID };
}
