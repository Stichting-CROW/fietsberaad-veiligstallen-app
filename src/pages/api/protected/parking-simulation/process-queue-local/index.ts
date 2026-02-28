import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { processQueues } from "~/server/services/queue/processor";

/**
 * POST: Trigger the local Next.js queue processor (new_wachtrij_* → new_transacties, etc.).
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
    console.error("[process-queue-local] Error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
