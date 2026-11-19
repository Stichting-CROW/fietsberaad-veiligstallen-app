import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { env } from "~/env.mjs";
import { NS_EXPLOITANT_URL_NAME } from "~/data/ns-organisation-data";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase } from "~/server/test-env/guard";
import { findNsDataEigenaar } from "~/server/test-env/ns-organisation-bootstrap";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!await assertTestEnvUser(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertTargetDatabase();
    const dataEigenaar = await findNsDataEigenaar(prisma);
    const exploitant = await prisma.contacts.findFirst({
      where: { UrlName: NS_EXPLOITANT_URL_NAME },
      select: { ID: true },
    });
    return res.status(200).json({
      exists: !!dataEigenaar,
      dataEigenaarId: dataEigenaar?.ID ?? null,
      exploitantExists: !!exploitant,
      nsConnectorConfigured: !!env.NSCONNECTOR_SUBSCRIPTION_KEY,
    });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
