import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { fietsenstallingen } from "~/generated/prisma-client";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    let parking = undefined;
    if (undefined !== req.query.ID && true !== Array.isArray(req.query.ID)) {
      const query = {
        where: { StallingsID: req.query.ID as string }, // Cast the ID to string
      }

      parking = await prisma.fietsenstallingen.findFirst(query);
      if(parking === null) {
        res.status(404).end();
        return;
      }

      const info: { parking: fietsenstallingen | null, organizations: string[] } = {
        parking: parking,
        organizations: []
      }

      console.log(info);
      const relatedOrganizations = await prisma.contact_fietsenstalling.findMany({
        where: {
          SiteID: parking.StallingsID || ""
        }
      });
      relatedOrganizations.forEach(organization => {
        info.organizations.push(organization.SiteID);
      });

      res.json(info);
    } else {
      res.status(405).end() // Method Not Allowed
    }
  } else {
    res.status(405).end() // Method Not Allowed
  }
}
