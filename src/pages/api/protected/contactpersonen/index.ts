import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type ContactpersonWithStallingen = {
  UserID: string;
  UserName: string;
  DisplayName: string | null;
  ContactID: string;
  ContactName: string | null;
  fietsenstallingen: {
    id: string;
    title: string | null;
    urlName: string | null;
  }[];
};

export type ContactpersonenResponse = {
  data?: ContactpersonWithStallingen[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<ContactpersonenResponse>
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );
  if (!hasSuperadmin) {
    res.status(403).json({ error: "Forbidden: fietsberaad_superadmin required" });
    return;
  }

  try {
    const contactPersonsSites = await prisma.security_users_sites.findMany({
      where: { IsContact: true },
      select: {
        UserID: true,
        SiteID: true,
        security_users: {
          select: {
            UserID: true,
            UserName: true,
            DisplayName: true,
          },
        },
      },
    });

    const siteIds = [...new Set(contactPersonsSites.map((s) => s.SiteID))];

    const gemeenten = await prisma.contacts.findMany({
      where: {
        ID: { in: siteIds },
        ItemType: "organizations",
        Status: "1",
      },
      select: { ID: true, CompanyName: true, UrlName: true },
    });
    const gemeenteMap = new Map(gemeenten.map((g) => [g.ID, g]));

    const fietsenstallingen = await prisma.fietsenstallingen.findMany({
      where: {
        SiteID: { in: siteIds },
        Status: { not: "0" },
        StallingsID: { not: null },
        Title: { not: "Systeemstalling" },
        contacts_fietsenstallingen_SiteIDTocontacts: { Status: { not: "0" } },
      },
      select: { ID: true, Title: true, SiteID: true },
    });

    const stallingenBySite = new Map<string, { id: string; title: string | null }[]>();
    for (const f of fietsenstallingen) {
      if (!f.SiteID) continue;
      const list = stallingenBySite.get(f.SiteID) ?? [];
      list.push({ id: f.ID, title: f.Title });
      stallingenBySite.set(f.SiteID, list);
    }

    const result: ContactpersonWithStallingen[] = [];
    const seen = new Set<string>();

    for (const row of contactPersonsSites) {
      const user = row.security_users;
      if (!user?.UserName) continue;

      const contactId = row.SiteID;
      const gemeente = gemeenteMap.get(contactId);
      if (!gemeente) continue;

      const key = `${user.UserID}:${contactId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const stallings = stallingenBySite.get(contactId) ?? [];
      const fietsenstallingenForUser = stallings.map((s) => ({
        id: s.id,
        title: s.title,
        urlName: gemeente.UrlName,
      }));

      result.push({
        UserID: user.UserID,
        UserName: user.UserName,
        DisplayName: user.DisplayName,
        ContactID: contactId,
        ContactName: gemeente.CompanyName,
        fietsenstallingen: fietsenstallingenForUser,
      });
    }

    res.status(200).json({ data: result });
  } catch (e) {
    console.error("contactpersonen - error:", e);
    res.status(500).json({ error: "Failed to fetch contactpersonen" });
  }
}
