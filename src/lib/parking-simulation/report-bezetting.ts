/**
 * Browser-side report bezetting after sim assignment changes.
 * Do not call v4 from the Next.js server (ACC Easy Auth / loopback).
 */

import {
  reportBezetting,
  type FmsCredentials,
  type FmsWriteResult,
} from "~/lib/parking-simulation/fms-api-write-client";

export type BezettingSnapshot = {
  locationid: string;
  sectionid: string;
  occupation: number;
  capacity?: number;
};

export async function fetchSimulationTime(): Promise<string> {
  const res = await fetch("/api/protected/parking-simulation/time");
  const data = (await res.json().catch(() => ({}))) as { simulationTime?: string };
  return data.simulationTime ?? new Date().toISOString();
}

function sectionKey(s: { locationid: string; sectionid: string }): string {
  return `${s.locationid}|${s.sectionid}`;
}

export async function reportBezettingSnapshots(
  creds: FmsCredentials | null | undefined,
  snapshots: BezettingSnapshot[] | undefined
): Promise<FmsWriteResult[]> {
  if (!creds || !snapshots?.length) return [];
  const transactionDate = await fetchSimulationTime();
  const seen = new Set<string>();
  const results: FmsWriteResult[] = [];
  for (const s of snapshots) {
    const key = sectionKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    const res = await reportBezetting(creds, s.locationid, s.sectionid, {
      occupation: s.occupation,
      capacity: s.capacity,
      transactionDate,
    });
    if (res.status !== 1) {
      console.warn("report bezetting failed", s.locationid, s.sectionid, res.message);
    }
    results.push(res);
  }
  return results;
}

export function occupationKeysFromState(occupation: Array<{ locationid: string; sectionid: string }>): BezettingSnapshot[] {
  const seen = new Set<string>();
  const out: BezettingSnapshot[] = [];
  for (const o of occupation) {
    const key = sectionKey(o);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ locationid: o.locationid, sectionid: o.sectionid, occupation: 0 });
  }
  return out;
}
