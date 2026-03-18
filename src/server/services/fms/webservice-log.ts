/**
 * Log FMS API calls to webservice_log for statistics and monitoring.
 * Matches ColdFusion behaviour (SERVICES_FMS.md: "Enhanced logging with method tracking in webservice_log table").
 */

import { prisma } from "~/server/db";

export async function logFmsCall(
  method: string,
  bikeparkID: string | null | undefined,
  logtekst: string,
  logtekst2?: string | null
): Promise<void> {
  try {
    await prisma.webservice_log.create({
      data: {
        tijdstip: new Date(),
        method,
        bikeparkID: bikeparkID ?? null,
        logtekst,
        logtekst2: logtekst2 ?? null,
      },
    });
  } catch (err) {
    console.error("[webservice_log] Failed to log FMS call:", err);
  }
}
