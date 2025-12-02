import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { prisma } from "~/server/db";
import { z } from "zod";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateParkingId } from "~/utils/validation";
import {
  fetchSectionsForStalling,
  fetchTariefregelsForStalling,
  upsertTariefregels,
  type TariefRow,
} from "~/server/services/tarieven";
import { Decimal } from "@prisma/client/runtime/library";
import { logPrismaError } from "~/utils/formatPrismaError";

const tariffRowSchema = z.object({
  index: z.number().int().min(1).max(4),
  tijdsspanne: z.number().nullable(),
  kosten: z.number().nullable(),
});

const updateSchema = z.object({
  hasUniSectionPrices: z.boolean().optional(),
  hasUniBikeTypePrices: z.boolean().optional(),
  tariffs: z
    .record(
      z.string(),
      z.array(tariffRowSchema)
    )
    .optional(),
});

export type TarievenResponse = {
  data?: {
    hasUniSectionPrices: boolean;
    hasUniBikeTypePrices: boolean;
    sections: Array<{
      sectieId: number;
      titel: string;
      capaciteit: number | null;
      bikeTypes: Array<{
        SectionBiketypeID: number;
        BikeTypeID: number;
        Name: string | null;
        Capaciteit: number | null;
      }>;
    }>;
    tariffs: TariefRow[];
  };
  error?: string;
};

export type TarievenData = NonNullable<TarievenResponse["data"]>;

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TarievenResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  const id = validateParkingId(req.query.id);
  if (!id) {
    res.status(400).json({ error: "Geen stalling opgegeven" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  const { sites, activeContactId } = validateUserSessionResult;
  
  // Get user name for EditorModified field
  const userName = session.user?.name || session.user?.email || 'unknown';

  const fietsenstalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: id },
    select: { SiteID: true },
  });

  if (!fietsenstalling || !fietsenstalling.SiteID || !sites.includes(fietsenstalling.SiteID)) {
    res.status(403).json({ error: "Geen toegang tot deze stalling" });
    return;
  }

  switch (req.method) {
    case "GET": {
      try {
        const stalling = await prisma.fietsenstallingen.findFirst({
          where: { ID: id },
        });

        if (!stalling) {
          console.error("Stalling niet gevonden");
          res.status(404).json({ error: "Stalling niet gevonden" });
          return;
        }

        // Fetch sections with bike types
        const sections = await fetchSectionsForStalling(id);

        // Fetch tariffs
        const { tariffs } = await fetchTariefregelsForStalling(id);

        // Format sections response
        const sectionsResponse = sections.map((section) => ({
          sectieId: section.sectieId,
          titel: section.titel,
          capaciteit: section.capaciteit,
          bikeTypes: section.secties_fietstype.map((sft) => ({
            SectionBiketypeID: sft.SectionBiketypeID,
            BikeTypeID: sft.BikeTypeID ?? 0,
            Name: sft.fietstype?.Name ?? null,
            Capaciteit: sft.Capaciteit,
          })),
        }));

        res.status(200).json({
          data: {
            hasUniSectionPrices: stalling.hasUniSectionPrices,
            hasUniBikeTypePrices: stalling.hasUniBikeTypePrices,
            sections: sectionsResponse,
            tariffs,
          },
        });
      } catch (error) {
        logPrismaError("Fetching tarieven", error);
        res.status(500).json({ error: "Fout bij het ophalen van tarieven" });
      }
      break;
    }

    case "PUT": {
      const hasAdminRights = userHasRight(
        session.user.securityProfile,
        VSSecurityTopic.instellingen_fietsenstallingen_admin
      );
      const hasLimitedRights = userHasRight(
        session.user.securityProfile,
        VSSecurityTopic.instellingen_fietsenstallingen_beperkt
      );

      if (!hasAdminRights && !hasLimitedRights) {
        res.status(403).json({ error: "Geen rechten om tarieven te beheren" });
        return;
      }

      try {
        const parseResult = updateSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({ error: "Ongeldige of ontbrekende gegevens" });
          return;
        }

        const { hasUniSectionPrices, hasUniBikeTypePrices, tariffs } = parseResult.data;

        // Get current stalling state
        const currentStalling = await prisma.fietsenstallingen.findFirst({
          where: { ID: id },
          select: {
            hasUniSectionPrices: true,
            hasUniBikeTypePrices: true,
          },
        });

        if (!currentStalling) {
          res.status(404).json({ error: "Stalling niet gevonden" });
          return;
        }

        const transactionStartTime = Date.now();
        
        await prisma.$transaction(async (tx) => {
          
          // Update flags if provided
          if (hasUniSectionPrices !== undefined || hasUniBikeTypePrices !== undefined) {
            const updateData: {
              hasUniSectionPrices?: boolean;
              hasUniBikeTypePrices?: boolean;
              EditorModified?: string | null;
              DateModified?: Date;
            } = {};

            if (hasUniSectionPrices !== undefined) {
              updateData.hasUniSectionPrices = hasUniSectionPrices;
            }
            if (hasUniBikeTypePrices !== undefined) {
              updateData.hasUniBikeTypePrices = hasUniBikeTypePrices;
            }
            
            // Always update EditorModified and DateModified when flags change
            updateData.EditorModified = userName;
            updateData.DateModified = new Date();

            await tx.fietsenstallingen.update({
              where: { ID: id },
              data: updateData,
            });

            // Handle flag changes - consolidate/duplicate tariffs
            const newHasUniSectionPrices =
              hasUniSectionPrices !== undefined
                ? hasUniSectionPrices
                : currentStalling.hasUniSectionPrices;
            const newHasUniBikeTypePrices =
              hasUniBikeTypePrices !== undefined
                ? hasUniBikeTypePrices
                : currentStalling.hasUniBikeTypePrices;

            // If flags changed, migrate tariffs
            if (
              hasUniSectionPrices !== undefined &&
              hasUniSectionPrices !== currentStalling.hasUniSectionPrices
            ) {
              if (hasUniSectionPrices) {
                // Consolidate: copy first section's tariffs to stalling level
                const firstSectionTariffs = await tx.tariefregels.findFirst({
                  where: {
                    stallingsID: id,
                    sectieID: { not: null },
                    sectionBikeTypeID: null,
                  },
                  orderBy: { sectieID: "asc" },
                });

                if (firstSectionTariffs) {
                  // Delete all section and bike type level tariffs
                  await tx.tariefregels.deleteMany({
                    where: {
                      stallingsID: id,
                      OR: [{ sectieID: { not: null } }, { sectionBikeTypeID: { not: null } }],
                    },
                  });

                  // Create stalling-level tariffs
                  const stallingTariffs = await tx.tariefregels.findMany({
                    where: {
                      stallingsID: id,
                      sectieID: firstSectionTariffs.sectieID,
                      sectionBikeTypeID: null,
                    },
                  });

                  await tx.tariefregels.createMany({
                    data: stallingTariffs.map((t) => ({
                      index: t.index,
                      tijdsspanne: t.tijdsspanne,
                      kosten: t.kosten,
                      stallingsID: id,
                      sectieID: null,
                      sectionBikeTypeID: null,
                    })),
                  });
                }
              } else {
                // Duplicate: copy stalling-level tariffs to all sections
                const stallingTariffs = await tx.tariefregels.findMany({
                  where: {
                    stallingsID: id,
                    sectieID: null,
                    sectionBikeTypeID: null,
                  },
                });

                const sections = await tx.fietsenstalling_sectie.findMany({
                  where: { fietsenstallingsId: id },
                  select: { sectieId: true },
                });

                // Delete stalling-level tariffs
                await tx.tariefregels.deleteMany({
                  where: {
                    stallingsID: id,
                    sectieID: null,
                    sectionBikeTypeID: null,
                  },
                });

                // Create section-level copies
                const sectionTariffs: Array<{
                  index: number | null;
                  tijdsspanne: number | null;
                  kosten: Decimal | null;
                  stallingsID: string;
                  sectieID: number;
                  sectionBikeTypeID: number | null;
                }> = [];

                for (const section of sections) {
                  for (const tariff of stallingTariffs) {
                    sectionTariffs.push({
                      index: tariff.index,
                      tijdsspanne: tariff.tijdsspanne,
                      kosten: tariff.kosten,
                      stallingsID: id,
                      sectieID: section.sectieId,
                      sectionBikeTypeID: null,
                    });
                  }
                }

                if (sectionTariffs.length > 0) {
                  await tx.tariefregels.createMany({
                    data: sectionTariffs,
                  });
                }
              }
            }

            // Similar logic for hasUniBikeTypePrices flag change
            if (
              hasUniBikeTypePrices !== undefined &&
              hasUniBikeTypePrices !== currentStalling.hasUniBikeTypePrices
            ) {
              if (hasUniBikeTypePrices) {
                // Consolidate: for each section, copy first bike type's tariffs to section level
                const sections = await tx.fietsenstalling_sectie.findMany({
                  where: { fietsenstallingsId: id },
                  select: { sectieId: true },
                });

                for (const section of sections) {
                  const firstBikeTypeTariff = await tx.tariefregels.findFirst({
                    where: {
                      stallingsID: id,
                      sectieID: section.sectieId,
                      sectionBikeTypeID: { not: null },
                    },
                    orderBy: { sectionBikeTypeID: "asc" },
                  });

                  if (firstBikeTypeTariff) {
                    // Get all tariffs for this bike type
                    const bikeTypeTariffs = await tx.tariefregels.findMany({
                      where: {
                        stallingsID: id,
                        sectieID: section.sectieId,
                        sectionBikeTypeID: firstBikeTypeTariff.sectionBikeTypeID,
                      },
                    });

                    // Delete all bike-type-level tariffs for this section
                    await tx.tariefregels.deleteMany({
                      where: {
                        stallingsID: id,
                        sectieID: section.sectieId,
                        sectionBikeTypeID: { not: null },
                      },
                    });

                    // Create section-level tariffs
                    await tx.tariefregels.createMany({
                      data: bikeTypeTariffs.map((t) => ({
                        index: t.index,
                        tijdsspanne: t.tijdsspanne,
                        kosten: t.kosten,
                        stallingsID: id,
                        sectieID: section.sectieId,
                        sectionBikeTypeID: null,
                      })),
                    });
                  }
                }
              } else {
                // Duplicate: copy section-level tariffs to all bike types
                const sections = await tx.fietsenstalling_sectie.findMany({
                  where: { fietsenstallingsId: id },
                  include: {
                    secties_fietstype: {
                      select: { SectionBiketypeID: true },
                    },
                  },
                });

                for (const section of sections) {
                  const sectionTariffs = await tx.tariefregels.findMany({
                    where: {
                      stallingsID: id,
                      sectieID: section.sectieId,
                      sectionBikeTypeID: null,
                    },
                  });

                  // Delete section-level tariffs
                  await tx.tariefregels.deleteMany({
                    where: {
                      stallingsID: id,
                      sectieID: section.sectieId,
                      sectionBikeTypeID: null,
                    },
                  });

                  // Create bike-type-level copies
                  const bikeTypeTariffs: Array<{
                    index: number | null;
                    tijdsspanne: number | null;
                    kosten: Decimal | null;
                    stallingsID: string;
                    sectieID: number;
                    sectionBikeTypeID: number;
                  }> = [];

                  for (const bikeType of section.secties_fietstype) {
                    for (const tariff of sectionTariffs) {
                      bikeTypeTariffs.push({
                        index: tariff.index,
                        tijdsspanne: tariff.tijdsspanne,
                        kosten: tariff.kosten,
                        stallingsID: id,
                        sectieID: section.sectieId,
                        sectionBikeTypeID: bikeType.SectionBiketypeID,
                      });
                    }
                  }

                  if (bikeTypeTariffs.length > 0) {
                    await tx.tariefregels.createMany({
                      data: bikeTypeTariffs,
                    });
                  }
                }
              }
            }
          }

          // Update tariffs if provided
          if (tariffs) {
            const tariffsMap = new Map<string, TariefRow[]>();
            for (const [scopeKey, rows] of Object.entries(tariffs)) {
              tariffsMap.set(scopeKey, rows);
            }
            // Pass the transaction client to avoid nested transactions
            await upsertTariefregels(id, tariffsMap, tx);
            
            // Update EditorModified and DateModified on the fietsenstalling
            await tx.fietsenstallingen.update({
              where: { ID: id },
              data: {
                EditorModified: userName,
                DateModified: new Date(),
              },
            });
            console.log(`[Tarieven Update] Updated EditorModified and DateModified for stalling`);
          }
        }, {
          timeout: 30000, // 30 seconds - increased from default 5 seconds
          maxWait: 10000, // Wait up to 10 seconds for a transaction slot
        });
        
        const transactionDuration = Date.now() - transactionStartTime;

        // Fetch updated data
        const stalling = await prisma.fietsenstallingen.findFirst({
          where: { ID: id },
          select: {
            hasUniSectionPrices: true,
            hasUniBikeTypePrices: true,
          },
        });

        if (!stalling) {
          res.status(404).json({ error: "Stalling niet gevonden" });
          return;
        }

        const sections = await fetchSectionsForStalling(id);
        const { tariffs: updatedTariffs } = await fetchTariefregelsForStalling(id);

        const sectionsResponse = sections.map((section) => ({
          sectieId: section.sectieId,
          titel: section.titel,
          capaciteit: section.capaciteit,
          bikeTypes: section.secties_fietstype.map((sft) => ({
            SectionBiketypeID: sft.SectionBiketypeID,
            BikeTypeID: sft.BikeTypeID ?? 0,
            Name: sft.fietstype?.Name ?? null,
            Capaciteit: sft.Capaciteit,
          })),
        }));

        res.status(200).json({
          data: {
            hasUniSectionPrices: stalling.hasUniSectionPrices,
            hasUniBikeTypePrices: stalling.hasUniBikeTypePrices,
            sections: sectionsResponse,
            tariffs: updatedTariffs,
          },
        });
      } catch (error) {
        logPrismaError("Updating tarieven", error);
        res.status(500).json({ error: "Fout bij het opslaan van tarieven" });
      }

      break;
    }

    default: {
      res.status(405).json({ error: "Methode niet toegestaan" });
    }
  }
}

