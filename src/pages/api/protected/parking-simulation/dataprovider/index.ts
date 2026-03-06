import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { generateID } from "~/utils/server/database-tools";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

const SIMULATIE_COMPANY = "simulatie";
const SIMULATIE_URLNAME = "simulatie";

function randomPassword(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ error: "Geen rechten" });
  }

  switch (req.method) {
    case "GET": {
      const contact = await prisma.contacts.findFirst({
        where: {
          CompanyName: SIMULATIE_COMPANY,
          ItemType: "dataprovider",
        },
        select: { ID: true, UrlName: true },
      });
      return res.status(200).json({
        exists: !!contact,
        urlname: contact?.UrlName ?? null,
      });
    }

    case "POST": {
      const existing = await prisma.contacts.findFirst({
        where: {
          CompanyName: SIMULATIE_COMPANY,
          ItemType: "dataprovider",
        },
        select: { ID: true },
      });
      if (existing) {
        return res.status(400).json({ error: "Simulatie dataprovider bestaat al" });
      }

      const testgemeente = await prisma.contacts.findFirst({
        where: {
          CompanyName: TESTGEMEENTE_NAME,
          ItemType: "organizations",
        },
        select: { ID: true },
      });
      if (!testgemeente) {
        return res.status(400).json({ error: "Testgemeente bestaat niet. Maak eerst een testgemeente aan." });
      }

      const password = randomPassword();
      const contactId = generateID();

      await prisma.$transaction(async (tx) => {
        await tx.contacts.create({
          data: {
            ID: contactId,
            ItemType: "dataprovider",
            CompanyName: SIMULATIE_COMPANY,
            UrlName: SIMULATIE_URLNAME,
            Status: "1",
            Password: password,
          },
        });

        await tx.fmsservice_permit.create({
          data: {
            Permit: "operator",
            OperatorID: contactId,
            SiteID: testgemeente.ID,
            BikeparkID: null,
          },
        });
      });

      return res.status(200).json({
        urlname: SIMULATIE_URLNAME,
        password,
      });
    }

    case "DELETE": {
      const contact = await prisma.contacts.findFirst({
        where: {
          CompanyName: SIMULATIE_COMPANY,
          ItemType: "dataprovider",
        },
        select: { ID: true },
      });
      if (!contact) {
        return res.status(404).json({ error: "Simulatie dataprovider bestaat niet" });
      }

      await prisma.fmsservice_permit.deleteMany({
        where: { OperatorID: contact.ID },
      });
      await prisma.contacts.delete({
        where: { ID: contact.ID },
      });

      return res.status(200).json({ ok: true });
    }

    default:
      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
  }
}
