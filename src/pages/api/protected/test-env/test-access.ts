import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";
import { assertTestEnvUser, sendTestEnvError } from "~/server/test-env/http";
import { assertTargetDatabase } from "~/server/test-env/guard";
import { TEST_LOGIN_PASSWORD } from "~/server/test-env/anonymize";
import {
  TEST_DATA_EIGENAAR_BEHEER_EMAIL,
  TEST_DATAPROVIDER,
  TEST_EXPLOITANT,
  TEST_EXPLOITANT_BEHEER_EMAIL,
} from "~/server/test-env/test-data-eigenaar-bootstrap";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!await assertTestEnvUser(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
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
      res.status(200).json({ exists: false });
      return;
    }

    const testUserEmails = [TEST_DATA_EIGENAAR_BEHEER_EMAIL, TEST_EXPLOITANT_BEHEER_EMAIL];
    const users = await prisma.security_users.findMany({
      where: { UserName: { in: testUserEmails } },
      select: { UserName: true, DisplayName: true },
    });

    const accounts: Array<{
      kind: "beheer_data_eigenaar" | "beheer_exploitant" | "fms_dataprovider";
      label: string;
      login: string;
      password: string;
    }> = [];

    for (const email of testUserEmails) {
      const user = users.find((u) => u.UserName === email);
      if (!user) continue;
      accounts.push({
        kind: email === TEST_DATA_EIGENAAR_BEHEER_EMAIL ? "beheer_data_eigenaar" : "beheer_exploitant",
        label: user.DisplayName ?? email,
        login: email,
        password: TEST_LOGIN_PASSWORD,
      });
    }

    const dataprovider = await prisma.contacts.findFirst({
      where: {
        ItemType: "dataprovider",
        OR: [
          { UrlName: TEST_DATAPROVIDER.urlName },
          { CompanyName: TEST_DATAPROVIDER.companyName },
        ],
      },
      select: { CompanyName: true, UrlName: true, Password: true },
    });

    if (dataprovider?.UrlName && dataprovider.Password) {
      accounts.push({
        kind: "fms_dataprovider",
        label: dataprovider.CompanyName ?? TEST_DATAPROVIDER.companyName,
        login: dataprovider.UrlName,
        password: dataprovider.Password,
      });
    }

    const exploitantLink = await prisma.contact_contact.findFirst({
      where: { childSiteID: contact.ID },
      include: {
        isManagingContacts: { select: { CompanyName: true } },
      },
    });

    res.status(200).json({
      exists: true,
      testgemeenteId: contact.ID,
      exploitantName: exploitantLink?.isManagingContacts?.CompanyName ?? TEST_EXPLOITANT.companyName,
      accounts,
    });
  } catch (error) {
    sendTestEnvError(res, error);
  }
}
