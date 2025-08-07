import type { NextApiRequest, NextApiResponse } from "next";
// import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!req.query || !req.query.parkingId || Array.isArray(req.query.parkingId)) {
    res.json({});
    return;
  }

  const where = {
    BikeparkID: req.query.parkingId
  }

  const subscriptionLinks = await prisma.abonnementsvorm_fietsenstalling.findMany({
    where: where,
    select: {
      SubscriptiontypeID: true,
      BikeparkID: true,
    }
  });

  // TODO Make query more efficient by using JOINs for example
  const subscriptionTypesForParking = [];
  for await (const x of subscriptionLinks) {
    const subscriptionType = await prisma.abonnementsvormen.findFirst({
      where: {
        ID: x.SubscriptiontypeID
      },
      select: {
        ID: true,
        naam: true,
        omschrijving: true,
        prijs: true,
        tijdsduur: true,
        conditions: true,
        siteID: true,
        bikeparkTypeID: true,
        isActief: true,
        exploitantSiteID: true,
        idmiddelen: true,
        contractID: true,
        paymentAuthorizationID: true,
        conditionsID: true
      }
    });
    subscriptionTypesForParking.push(subscriptionType);
  }
  res.json(subscriptionTypesForParking)
}
