import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase } from "~/server/test-env/guard";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!await assertTestEnvUser(req, res)) return;
  if (req.method !== "GET") {
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
    return res.status(200).json({ exists: !!contact, id: contact?.ID ?? null });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
