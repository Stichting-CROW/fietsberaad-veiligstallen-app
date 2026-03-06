import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

/**
 * POST: Reset wachtrij_transacties processed status to 0 (wachtend) so the record can be retried.
 * Mirrors legacy viewTransactions.cfm reset 2→0, 8→0.
 * Body: { id: number, useNewTables?: boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.wachtrij)) {
    return res.status(403).json({ error: "Access denied" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const id = typeof body.id === "number" ? body.id : parseInt(String(body.id ?? ""), 10);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const useNewTables = body.useNewTables === true || body.useNewTables === "true";

  try {
    if (useNewTables) {
      const updated = await prisma.new_wachtrij_transacties.updateMany({
        where: { ID: id },
        data: { processed: 0, error: null, processDate: null },
      });
      if (updated.count === 0) {
        return res.status(404).json({ error: "Record not found" });
      }
    } else {
      const updated = await prisma.wachtrij_transacties.updateMany({
        where: { ID: id },
        data: { processed: 0, error: null, processDate: null },
      });
      if (updated.count === 0) {
        return res.status(404).json({ error: "Record not found" });
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[reset-transactie] Error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
