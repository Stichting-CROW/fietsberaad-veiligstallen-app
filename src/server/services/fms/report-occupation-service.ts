/**
 * reportOccupationData / reportJsonOccupationData service.
 * Writes reported occupation data to new_bezettingsdata_tmp (Next.js input
 * queue) with the reporting login as source, and always copies the number onto
 * fietsenstalling_sectie.Bezetting (ColdFusion REST v3 setOccupation).
 * When that login is not the stalling's BronBezettingsdata, a warning goes to
 * webservice_log: for an FMS stalling the report overwrites the +1/−1 count.
 * ColdFusion keeps bezettingsdata_tmp. Next.js rollup copies new_* → bezettingsdata.
 *
 * Write path: docs/analyse-api/fms-write-paths.md.
 */

import { prisma } from "~/server/db";
import { logFmsCall } from "./webservice-log";

const DEFAULT_INTERVAL = 15;
export const OCCUPATION_SOURCE_WARNING_METHOD = "occupationSourceWarning";
/** new_bezettingsdata_tmp.source and bezettingsdata.source are VarChar(25). */
const SOURCE_MAX_LENGTH = 25;

export interface ReportOccupationPayload {
  timestamp?: string | Date;
  occupation: number;
  capacity?: number;
  checkins?: number;
  checkouts?: number;
  open?: boolean;
  interval?: number;
  /** FMS login that reported the number. */
  source: string;
  rawData?: string;
}

/** ColdFusion compares the login with BronBezettingsdata case-insensitively. */
export function isChosenOccupationSource(
  bronBezettingsdata: string | null | undefined,
  source: string
): boolean {
  return (bronBezettingsdata ?? "").trim().toLowerCase() === source.trim().toLowerCase();
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
  const source = payload.source.trim().slice(0, SOURCE_MAX_LENGTH);
  if (!source) {
    throw new Error("Bron van de bezettingsdata ontbreekt");
  }

  const section = await prisma.fietsenstalling_sectie.findFirst({
    where: {
      externalId: sectionID,
      fietsenstalling: {
        StallingsID: bikeparkID,
      },
    },
    select: { sectieId: true, fietsenstalling: { select: { BronBezettingsdata: true } } },
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

  const bron = section.fietsenstalling?.BronBezettingsdata ?? null;
  if (!isChosenOccupationSource(bron, source)) {
    void warnOccupationSource({ bikeparkID, sectionID, source, bron, occupation: payload.occupation });
  }

  return { ok: true, tmpId: tmpRow.ID };
}

/** At most one occupationSourceWarning per stalling and login in this window. */
const WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
const lastWarningAt = new Map<string, number>();

function warningLoginMarker(source: string): string {
  return `door login ${source},`;
}

async function warnOccupationSource(input: {
  bikeparkID: string;
  sectionID: string;
  source: string;
  bron: string | null;
  occupation: number;
}): Promise<void> {
  try {
    const key = `${input.bikeparkID}\0${input.source.toLowerCase()}`;
    const now = Date.now();
    const memo = lastWarningAt.get(key);
    if (memo != null && now - memo < WARNING_WINDOW_MS) return;

    const marker = warningLoginMarker(input.source);
    const recent = await prisma.webservice_log.findFirst({
      where: {
        method: OCCUPATION_SOURCE_WARNING_METHOD,
        bikeparkID: input.bikeparkID,
        tijdstip: { gte: new Date(now - WARNING_WINDOW_MS) },
        logtekst: { contains: marker },
      },
      select: { tijdstip: true },
    });
    if (recent) {
      lastWarningAt.set(key, recent.tijdstip.getTime());
      return;
    }

    lastWarningAt.set(key, now);
    const bron = input.bron?.trim() || "(leeg)";
    await logFmsCall(
      OCCUPATION_SOURCE_WARNING_METHOD,
      input.bikeparkID,
      `Bezetting van sectie ${input.sectionID} gezet op ${input.occupation} ${marker} maar de gekozen bron bezettingsdata is ${bron}. Volgende waarschuwing voor deze login en stalling na 24 uur.`,
      bron.toUpperCase() === "FMS" ? "De telling uit de managed transacties is overschreven." : null
    );
  } catch (err) {
    console.error("[occupationSourceWarning] Kon waarschuwing niet loggen:", err);
  }
}
