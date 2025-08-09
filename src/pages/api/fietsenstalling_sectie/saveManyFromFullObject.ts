import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { ParkingSection, ParkingSectionPerBikeType, UpdateParkingSectionsData } from "~/types/parking";
import { type VSFietstype, VSFietsTypenWaarden } from "~/types/fietstypen";

const updateSingleSubSection = async (parkingId: string, sectionId: number, subSectionPerFietstype: ParkingSectionPerBikeType, fietstypen: VSFietstype[]) => {
  const fietstypedata = fietstypen.find((fietstype) => {
    return fietstype.Name === subSectionPerFietstype.fietstype.Name;
  })

  if (fietstypedata === undefined) {
    console.error('No vehicle type found');
    return false
  }

  // Check if capaciteit for this vehicle type exists in database
  const dbCapaciteit = await prisma.sectie_fietstype.findFirst({
    where: {
      sectieID: sectionId,
      BikeTypeID: fietstypedata.ID
    }
  });

  // Update parking section capacities
  if (dbCapaciteit) {
    const result = await prisma.sectie_fietstype.update({
      where: {
        SectionBiketypeID: dbCapaciteit.SectionBiketypeID,
        BikeTypeID: fietstypedata.ID
      },
      data: {
        Capaciteit: Number(subSectionPerFietstype.Capaciteit),
        Toegestaan: subSectionPerFietstype.Toegestaan
      }
    })
  } else { // Or create parking section capacity row
    await prisma.sectie_fietstype.create({
      data: {
        BikeTypeID: fietstypedata.ID,
        sectieID: sectionId,
        StallingsID: parkingId,
        Capaciteit: subSectionPerFietstype.Capaciteit,
        Toegestaan: subSectionPerFietstype.Toegestaan
      }
    });
  }
}

const updateSingleSection = async (parkingId: string, sectionId: number, section: ParkingSection, fietstypen: VSFietstype[]) => {
  // Go over given sections
  section.secties_fietstype.map(async (subSectionPerFietstype) => {
    if (false === await updateSingleSubSection(parkingId, sectionId, subSectionPerFietstype, fietstypen)) {
      return false;
    }
  });

  return true;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if ((req.method as string) !== "POST") return;

  const data = req.body as UpdateParkingSectionsData;

  if (data.parkingSections.length === 0 || data.parkingSections[0] === undefined) {
    console.error('No parking sections given');
    res.status(405).end();
    return;
  }

  // Get fietstypes
  if (!updateSingleSection(data.parkingId, data.sectionId, data.parkingSections[0], VSFietsTypenWaarden)) {
    res.status(405).end();
  }

  res.json({})
}
