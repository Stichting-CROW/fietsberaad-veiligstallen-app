import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { processQueues } from "~/server/services/queue/processor";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/**
 * POST: Drain Next.js input queues (new_wachtrij_* / new_bezettingsdata_tmp → production).
 * Always uses processQueues(). Does not call ColdFusion processTransactions2.cfm.
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

  try {
    const result = await processQueues();
    return res.status(200).json({
      ok: true,
      result: {
        pasids: result.pasids,
        managedTransacties: result.managedTransacties,
        betalingen: result.betalingen,
        sync: result.sync,
        occupation: result.occupation,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[process-queue] Local processor error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
