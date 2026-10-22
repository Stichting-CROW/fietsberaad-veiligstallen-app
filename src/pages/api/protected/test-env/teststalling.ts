import type { NextApiRequest, NextApiResponse } from "next";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase } from "~/server/test-env/guard";
import { ensureTestAdmin } from "~/server/test-env/seed-admin";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!await assertTestEnvUser(req, res)) return;
  try {
    assertTargetDatabase();
    const login = await ensureTestAdmin();
    res.status(200).json({
      login,
      testgemeenteUrl: "/api/protected/parking-simulation/test-gemeente/create",
    });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
