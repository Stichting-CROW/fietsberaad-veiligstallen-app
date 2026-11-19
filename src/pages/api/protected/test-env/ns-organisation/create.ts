import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { env } from "~/env.mjs";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase, TestEnvError } from "~/server/test-env/guard";
import { bootstrapNsOrganisation, findNsDataEigenaar } from "~/server/test-env/ns-organisation-bootstrap";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!await assertTestEnvUser(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertTargetDatabase();
    if (!env.NSCONNECTOR_SUBSCRIPTION_KEY) {
      throw new TestEnvError(
        "NSCONNECTOR_SUBSCRIPTION_KEY is niet ingesteld. Bootstrap is alleen zinvol als de NS Places API bereikbaar is.",
      );
    }

    const existing = await findNsDataEigenaar(prisma);
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "NS data-eigenaar bestond al",
        dataEigenaarId: existing.ID,
      });
    }

    const ids = await prisma.$transaction(async (tx) => bootstrapNsOrganisation(tx));

    return res.status(200).json({
      success: true,
      message: "NS data-eigenaar en exploitant ns-stations aangemaakt",
      ...ids,
    });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
