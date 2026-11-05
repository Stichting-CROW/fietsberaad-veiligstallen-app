import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { formatPrismaErrorCompact, logPrismaError } from "~/utils/formatPrismaError";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase, TestEnvError } from "~/server/test-env/guard";
import { deleteTestDataEigenaarTree } from "~/server/test-env/test-data-eigenaar-bootstrap";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!await assertTestEnvUser(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    assertTargetDatabase();
    const contact = await prisma.contacts.findFirst({
      where: {
        CompanyName: TESTGEMEENTE_NAME,
        ItemType: "organizations",
      },
      select: { ID: true },
    });

    if (!contact) {
      return res.status(200).json({
        success: true,
        message: "Test data-eigenaar bestond niet",
      });
    }

    await prisma.$transaction(async (tx) => {
      await deleteTestDataEigenaarTree(tx, contact.ID);
    }, { timeout: 60000 });

    return res.status(200).json({
      success: true,
      message: "Test data-eigenaar verwijderd",
    });
  } catch (error) {
    logPrismaError("test-gemeente delete", error);
    if (error instanceof TestEnvError) {
      sendTestEnvError(res, error);
      return;
    }
    return res.status(500).json({ error: formatPrismaErrorCompact(error) });
  }
}
