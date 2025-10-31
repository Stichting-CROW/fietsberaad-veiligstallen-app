import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateUserSession } from "~/utils/server/database-tools";
import { selectSectieDetailsType, type SectieDetailsType, type SectiesResponse } from "~/types/secties";
import { z } from "zod";

/**
 * Calculate total capacity for a fietsenstalling from all its sections
 * This mirrors the ColdFusion calculateCapacity() method
 */
const calculateFietsenstallingCapacity = async (fietsenstallingId: string): Promise<number> => {
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { 
      fietsenstallingsId: fietsenstallingId,
      isactief: true 
    },
    include: {
      secties_fietstype: {
        where: {
          Toegestaan: true // Only include bike types that are explicitly allowed
        }
      }
    }
  });

  let totalCapacity = 0;
  for (const section of sections) {
    for (const bikeType of section.secties_fietstype) {
      totalCapacity += bikeType.Capaciteit || 0;
    }
  }

  return totalCapacity;
};

/**
 * Update the Capacity field in fietsenstallingen table
 */
const updateFietsenstallingCapacity = async (fietsenstallingId: string): Promise<void> => {
  const newCapacity = await calculateFietsenstallingCapacity(fietsenstallingId);
  await prisma.fietsenstallingen.update({
    where: { ID: fietsenstallingId },
    data: { Capacity: newCapacity }
  });
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SectiesResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  const sectionId = req.query.id as string;
  const fietsenstallingId = req.query.fietsenstallingId as string | undefined;

  // Check authentication
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  // Check user rights
  const hasFietsenstallingenAdmin = userHasRight(
    session?.user?.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_admin
  );
  const hasFietsenstallingenBeperkt = userHasRight(
    session?.user?.securityProfile,
    VSSecurityTopic.instellingen_fietsenstallingen_beperkt
  );

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  const { sites } = validateUserSessionResult;

  // Validate access to parent fietsenstalling
  if (fietsenstallingId && fietsenstallingId !== "new") {
    const fietsenstalling = await prisma.fietsenstallingen.findFirst({
      where: { ID: fietsenstallingId },
      select: { SiteID: true }
    });

    if (!fietsenstalling?.SiteID || !sites.includes(fietsenstalling.SiteID)) {
      console.error("Unauthorized - no access to this fietsenstalling", fietsenstallingId);
      res.status(403).json({ error: "No access to this fietsenstalling" });
      return;
    }
  }

  switch (req.method) {
    case "GET": {
      if (sectionId === "all" && fietsenstallingId) {
        // List all sections for a fietsenstalling
        const sections = await prisma.fietsenstalling_sectie.findMany({
          where: { fietsenstallingsId: fietsenstallingId },
          select: selectSectieDetailsType,
          orderBy: { sectieId: "asc" }
        });

        res.status(200).json({ data: sections as SectieDetailsType[] });
        return;
      } else if (sectionId !== "all" && !isNaN(parseInt(sectionId))) {
        // Get single section
        const section = await prisma.fietsenstalling_sectie.findFirst({
          where: { sectieId: parseInt(sectionId) },
          select: selectSectieDetailsType
        });

        if (!section) {
          res.status(404).json({ error: "Section not found" });
          return;
        }

        // Validate access to this section's parent fietsenstalling
        if (section.fietsenstallingsId) {
          const fietsenstalling = await prisma.fietsenstallingen.findFirst({
            where: { ID: section.fietsenstallingsId },
            select: { SiteID: true }
          });

          if (!fietsenstalling?.SiteID || !sites.includes(fietsenstalling.SiteID)) {
            console.error("Unauthorized - no access to this section");
            res.status(403).json({ error: "No access to this section" });
            return;
          }
        }

        res.status(200).json({ data: section as SectieDetailsType });
        return;
      } else {
        res.status(400).json({ error: "Invalid request: missing fietsenstallingId or sectionId" });
        return;
      }
    }

    case "POST": {
      // Create new section
      if (!hasFietsenstallingenAdmin && !hasFietsenstallingenBeperkt) {
        res.status(403).json({ error: "Access denied - insufficient permissions" });
        return;
      }

      const data = req.body;
      
      if (!data.fietsenstallingsId) {
        res.status(400).json({ error: "fietsenstallingsId is required" });
        return;
      }

      // Generate external ID based on StallingsID and get Type for isKluis
      const fietsenstalling = await prisma.fietsenstallingen.findFirst({
        where: { ID: data.fietsenstallingsId },
        select: { StallingsID: true, Type: true }
      });

      if (!fietsenstalling?.StallingsID) {
        res.status(404).json({ error: "Fietsenstalling not found" });
        return;
      }
      
      // Set isKluis based on fietsenstalling type
      // isKluis = 1 for fietskluizen type, 0 for other types
      const isKluis = (fietsenstalling.Type === "fietskluizen");

      // Get existing sections and find the highest index number
      // Pattern: StallingsID_index (e.g., mb02_001, mb02_002)
      const existingSections = await prisma.fietsenstalling_sectie.findMany({
        where: { fietsenstallingsId: data.fietsenstallingsId },
        select: { externalId: true }
      });
      
      const prefix = `${fietsenstalling.StallingsID}_`;
      let highestIndex = 0;
      
      for (const section of existingSections) {
        if (!section.externalId) continue;
        
        // Check if externalId matches the pattern
        if (section.externalId.startsWith(prefix)) {
          const indexPart = section.externalId.substring(prefix.length);
          const index = parseInt(indexPart, 10);
          
          // Only consider valid numbers
          if (!isNaN(index) && index > 0 && index > highestIndex) {
            highestIndex = index;
          }
        }
      }
      
      // Next index is highest + 1, starting from 001
      const nextIndex = highestIndex + 1;
      const externalId = `${fietsenstalling.StallingsID}_${nextIndex.toString().padStart(3, '0')}`;
      
      console.log(`Creating section with externalId: ${externalId} (next index: ${nextIndex})`);

      // Create section
      const newSection = await prisma.fietsenstalling_sectie.create({
        data: {
          externalId,
          titel: data.titel || "Nieuwe sectie",
          omschrijving: data.omschrijving || null,
          capaciteit: data.capaciteit || null,
          kleur: data.kleur || "00FF00",
          fietsenstallingsId: data.fietsenstallingsId,
          qualificatie: data.qualificatie || "NONE",
          isactief: data.isactief !== undefined ? data.isactief : true,
          isKluis: isKluis,
        },
        select: selectSectieDetailsType
      });

      // Create default sectie_fietstype entries for all bike types
      const allBikeTypes = await prisma.fietstypen.findMany();
      const sectionBikeTypes = allBikeTypes.map(bikeType => ({
        sectieID: newSection.sectieId,
        BikeTypeID: bikeType.ID,
        Capaciteit: 0,
        Toegestaan: true,
        StallingsID: fietsenstalling.StallingsID
      }));

      await prisma.sectie_fietstype.createMany({
        data: sectionBikeTypes
      });

      // Fetch the created section with all relations
      const createdSection = await prisma.fietsenstalling_sectie.findFirst({
        where: { sectieId: newSection.sectieId },
        select: selectSectieDetailsType
      });

      // Update the fietsenstalling Capacity field
      await updateFietsenstallingCapacity(data.fietsenstallingsId);

      res.status(201).json({ data: createdSection as SectieDetailsType });
      break;
    }

    case "PUT": {
      // Update section
      if (!hasFietsenstallingenAdmin && !hasFietsenstallingenBeperkt) {
        res.status(403).json({ error: "Access denied - insufficient permissions" });
        return;
      }

      const sectionIdNum = parseInt(sectionId);
      
      // Get existing section
      const existingSection = await prisma.fietsenstalling_sectie.findFirst({
        where: { sectieId: sectionIdNum },
        select: { fietsenstallingsId: true }
      });

      if (!existingSection) {
        res.status(404).json({ error: "Section not found" });
        return;
      }

      // Update section
      const updatedSection = await prisma.fietsenstalling_sectie.update({
        where: { sectieId: sectionIdNum },
        data: {
          titel: req.body.titel,
          omschrijving: req.body.omschrijving || null,
          capaciteit: req.body.capaciteit || null,
          kleur: req.body.kleur || "00FF00",
          qualificatie: req.body.qualificatie || "NONE",
          isactief: req.body.isactief !== undefined ? req.body.isactief : true,
        },
        select: selectSectieDetailsType
      });

      // Update sectie_fietstype entries if provided
      if (req.body.secties_fietstype && Array.isArray(req.body.secties_fietstype)) {
        for (const bikeTypeData of req.body.secties_fietstype) {
          await prisma.sectie_fietstype.updateMany({
            where: {
              sectieID: sectionIdNum,
              BikeTypeID: bikeTypeData.BikeTypeID
            },
            data: {
              Capaciteit: bikeTypeData.Capaciteit ?? 0,
              Toegestaan: bikeTypeData.Toegestaan ?? true
            }
          });
        }

        // Fetch updated section with all relations
        const sectionWithRelations = await prisma.fietsenstalling_sectie.findFirst({
          where: { sectieId: sectionIdNum },
          select: selectSectieDetailsType
        });

        // Update the fietsenstalling Capacity field
        if (existingSection.fietsenstallingsId) {
          await updateFietsenstallingCapacity(existingSection.fietsenstallingsId);
        }

        res.status(200).json({ data: sectionWithRelations as SectieDetailsType });
      } else {
        // Update the fietsenstalling Capacity field (even if only section metadata changed)
        if (existingSection.fietsenstallingsId) {
          await updateFietsenstallingCapacity(existingSection.fietsenstallingsId);
        }
        res.status(200).json({ data: updatedSection as SectieDetailsType });
      }
      break;
    }

    case "DELETE": {
      // Delete section
      if (!hasFietsenstallingenAdmin) {
        res.status(403).json({ error: "Access denied - admin rights required for this operation" });
        return;
      }

      const sectionIdNum = parseInt(sectionId);

      // Check if section exists
      const existingSection = await prisma.fietsenstalling_sectie.findFirst({
        where: { sectieId: sectionIdNum },
        select: { fietsenstallingsId: true }
      });

      if (!existingSection) {
        res.status(404).json({ error: "Section not found" });
        return;
      }

      // Prevent deletion of the last section
      if (existingSection.fietsenstallingsId) {
        const sectionCount = await prisma.fietsenstalling_sectie.count({
          where: { 
            fietsenstallingsId: existingSection.fietsenstallingsId 
          }
        });

        if (sectionCount <= 1) {
          res.status(400).json({ error: "Cannot delete the last section. Each fietsenstalling must have at least one section." });
          return;
        }
      }

      // Delete section (will cascade to sectie_fietstype due to database constraints)
      await prisma.fietsenstalling_sectie.delete({
        where: { sectieId: sectionIdNum }
      });

      // Update the fietsenstalling Capacity field
      if (existingSection.fietsenstallingsId) {
        await updateFietsenstallingCapacity(existingSection.fietsenstallingsId);
      }

      res.status(200).json({ data: undefined });
      break;
    }

    default: {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  }
}

