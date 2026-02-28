import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { processQueues } from "~/server/services/queue/processor";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

const DEFAULT_PROCESS_QUEUE_BASE = "https://remote.veiligstallenontwikkel.nl";

/**
 * POST: Trigger the ColdFusion processTransactions2.cfm queue processor.
 * Uses processQueueBaseUrl from parkingmgmt_simulation_config (default: remote.veiligstallenontwikkel.nl).
 * Proxies the request to avoid CORS. Returns the plain-text response.
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    return res.status(400).json({ message: "Testgemeente niet gevonden" });
  }

  const pmConfig = await prisma.parkingmgmt_simulation_config.findUnique({
    where: { siteID: contact.ID },
    select: { processQueueBaseUrl: true, useLocalProcessor: true },
  });

  if (pmConfig?.useLocalProcessor) {
    try {
      const result = await processQueues();
      return res.status(200).json({
        ok: true,
        result: {
          pasids: result.pasids,
          transacties: result.transacties,
          betalingen: result.betalingen,
          sync: result.sync,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[process-queue] Local processor error:", msg);
      return res.status(500).json({ ok: false, message: "Fout: " + msg });
    }
  }

  const base = (pmConfig?.processQueueBaseUrl ?? DEFAULT_PROCESS_QUEUE_BASE).replace(/\/$/, "");
  const url = `${base}/remote/processTransactions2.cfm`;

  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    console.log("[process-queue] URL:", url, "status:", response.status, "result:", text);
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, message: text || response.statusText });
    }
    return res.status(200).json({ ok: true, result: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[process-queue] Error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
