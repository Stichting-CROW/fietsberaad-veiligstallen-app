import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";

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
    let url = "";
    switch (parking.Type) {
      case "fietskluizen":
        url = `https://veiligstallen.nl/${municipality.UrlName}/fietskluizen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      case "fietstrommel":
        url = `https://veiligstallen.nl/${municipality.UrlName}/fietstrommels/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      case "buurtstalling":
        url = `https://veiligstallen.nl/${municipality.UrlName}/buurtstallingen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
      default:
        url = `https://veiligstallen.nl/${municipality.UrlName}/stallingen/${parking.StallingsID}#${parking.StallingsID}`;
        break;
    }
    res.status(200).json({ status: true, url });
  }
}