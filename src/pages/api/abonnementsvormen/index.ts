import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";

export default async function handle(req, res) {
  if (req.method === "GET") {
    if ("siteId" in req.query) {
      const siteId: string = req.query.siteId as string;
      const bikeparkTypeID: string = req.query.bikeparkTypeID as string;

      const where = {};
      where.isActief = true;
      where.siteID = siteId;
      if (bikeparkTypeID) where.bikeparkTypeID = bikeparkTypeID

      // console.log('where', where);

      const query = {
        where: where,
        orderBy: [
          {
            naam: 'asc',
          },
        ],
      }

      const result = await prisma.abonnementsvormen.findMany(query);
      res.json(result)
      return;
    }
  }

  res.json({});
}
