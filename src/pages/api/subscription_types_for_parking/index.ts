import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { AbonnementsvormenType } from "~/types/parking";
import { validateParkingId } from "~/utils/validation";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const parkingId = validateParkingId(
    Array.isArray(req.query.parkingId) ? req.query.parkingId[0] : req.query.parkingId,
  );

  if (!parkingId) {
    res.status(400).json({ error: "Ongeldige stalling-ID" });
    return;
  }

  try {
    const parking = await prisma.fietsenstallingen.findFirst({
      where: { ID: parkingId },
      select: { Type: true }
  });

    if (!parking) {
      res.json([]);
      return;
    }

    const subscriptions = await prisma.abonnementsvorm_fietsenstalling.findMany({
      where: { BikeparkID: parkingId },
      select: {
        abonnementsvormen: {
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
        }
      }
    });

    const subscriptionIds = subscriptions
      .map(item => item.abonnementsvormen?.ID)
      .filter((id): id is number => typeof id === "number");

    let bikeTypesByAbonnement = new Map<number, string[]>();

    if (subscriptionIds.length > 0) {
      const abonnementBikeLinks = await prisma.abonnementsvorm_fietstype.findMany({
        where: { SubscriptiontypeID: { in: subscriptionIds } },
        select: {
          SubscriptiontypeID: true,
          BikeTypeID: true
        }
      });

      const bikeTypeIDs = Array.from(new Set(abonnementBikeLinks.map(link => link.BikeTypeID)));

      const bikeTypes = bikeTypeIDs.length > 0
        ? await prisma.fietstypen.findMany({
            where: { ID: { in: bikeTypeIDs } },
            select: { ID: true, Name: true }
          })
        : [];

      const bikeTypeNameMap = new Map(bikeTypes.map(bt => [bt.ID, bt.Name || ""]));

      bikeTypesByAbonnement = abonnementBikeLinks.reduce((map, link) => {
        const existing = map.get(link.SubscriptiontypeID) ?? [];
        const label = bikeTypeNameMap.get(link.BikeTypeID);
        if (label) {
          existing.push(label);
        }
        map.set(link.SubscriptiontypeID, existing);
        return map;
      }, new Map<number, string[]>());
    }

    const filtered: AbonnementsvormenType[] = subscriptions
      .map(item => item.abonnementsvormen)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter(item => item.isActief === true)
      .filter(item => !item.bikeparkTypeID || item.bikeparkTypeID === parking.Type)
      .map(item => ({
        ID: item.ID,
        naam: item.naam,
        omschrijving: item.omschrijving,
        prijs: item.prijs ? Number(item.prijs) : null,
        tijdsduur: item.tijdsduur,
        conditions: item.conditions,
        siteID: item.siteID,
        bikeparkTypeID: item.bikeparkTypeID,
        isActief: item.isActief,
        exploitantSiteID: item.exploitantSiteID,
        idmiddelen: item.idmiddelen,
        contractID: item.contractID,
        paymentAuthorizationID: item.paymentAuthorizationID,
        conditionsID: item.conditionsID,
        allowedBikeTypes: bikeTypesByAbonnement.get(item.ID) ?? []
      }));

    res.json(filtered);
  } catch (error) {
    console.error("Error fetching subscription types for parking:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
