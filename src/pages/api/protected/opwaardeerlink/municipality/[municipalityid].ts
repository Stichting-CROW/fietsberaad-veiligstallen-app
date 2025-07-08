import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { municipalityid } = req.query;
  if (!municipalityid || Array.isArray(municipalityid)) {
    res.status(400).json({ url: "" });
    return;
  }

  // Get UrlName for the municipality
  const municipality = await prisma.contacts.findUnique({
    where: { ID: municipalityid },
    select: { UrlName: true },
  });

  if (!municipality || !municipality.UrlName) {
    res.status(200).json({ url: "" });
    return;
  }

  // Get fietsenstallingen for this SiteID, excluding Systeemstalling
  const fietsenstallingen = await prisma.fietsenstallingen.findMany({
    where: {
      SiteID: municipalityid,
      Title: { not: "Systeemstalling" },
    },
    select: { BerekentStallingskosten: true },
  });

  const hasOpwaardeer = fietsenstallingen.some(fs => fs.BerekentStallingskosten === false);
  const url = municipality.UrlName && hasOpwaardeer ? `https://veiligstallen.nl/${municipality.UrlName}/stallingstegoed` : "";

  res.status(200).json({ url });
} 