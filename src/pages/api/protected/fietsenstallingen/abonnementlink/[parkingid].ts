import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getBaseUrl } from "~/utils/server/database-tools";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { parkingid } = req.query;
  if (!parkingid || Array.isArray(parkingid)) {
    res.status(400).json({ url: "" });
    return;
  }

  const parking = await prisma.fietsenstallingen.findUnique({
    where: { ID: parkingid },
    select: { SiteID: true, Type: true, StallingsID: true },
  });

  if(!parking || !parking.SiteID || !parking.Type) {
    // bad parking info
    res.status(404).json({ status: false, url: "" });
    return;
  }

  // Get UrlName for the municipality
  const municipality = await prisma.contacts.findUnique({
    where: { ID: parking.SiteID },
    select: { UrlName: true },
  });

  const subscriptionTypes = await prisma.abonnementsvormen.findMany({
    where: {
      bikeparkTypeID: parking.Type,
      siteID: parking.SiteID,
    },
    select: { ID: true },
  });

  if (!municipality || !municipality.UrlName || !subscriptionTypes || subscriptionTypes.length === 0) {
    res.status(200).json({ status: true, url: "" });
  } else {
    const base = getBaseUrl(req).replace(/\/$/, "");
    const ref = parking.StallingsID ?? "";
    let path = "";
    switch (parking.Type) {
      case "fietskluizen":
        path = `/${municipality.UrlName}/fietskluizen/${ref}#${ref}`;
        break;
      case "fietstrommel":
        path = `/${municipality.UrlName}/fietstrommels/${ref}#${ref}`;
        break;
      case "buurtstalling":
        path = `/${municipality.UrlName}/buurtstallingen/${ref}#${ref}`;
        break;
      default:
        path = `/${municipality.UrlName}/stallingen/${ref}#${ref}`;
        break;
    }
    res.status(200).json({ status: true, url: `${base}${path}` });
  }
}