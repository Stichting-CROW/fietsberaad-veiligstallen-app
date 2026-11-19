import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;

  if (siteId) {
    const stallings = await prisma.fietsenstallingen.findMany({
      where: { SiteID: siteId, Status: "1" },
      select: { ID: true, Title: true, StallingsID: true },
      orderBy: { Title: "asc" },
    });
    return res.status(200).json({
      data: stallings.map((s) => ({
        id: s.ID,
        title: s.Title ?? "",
        stallingsID: s.StallingsID,
      })),
    });
  }

  const gemeenten = await prisma.contacts.findMany({
    where: { ItemType: "organizations", Status: "1" },
    select: { ID: true, CompanyName: true, UrlName: true },
    orderBy: { CompanyName: "asc" },
  });

  return res.status(200).json({
    data: gemeenten.map((g) => ({
      id: g.ID,
      companyName: g.CompanyName ?? "",
      urlName: g.UrlName ?? "",
    })),
  });
}
