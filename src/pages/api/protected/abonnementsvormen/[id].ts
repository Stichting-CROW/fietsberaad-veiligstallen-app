import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import type { VSAbonnementsvorm } from "~/types/abonnementsvormen";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { z } from "zod";

export type AbonnementsvormResponse = {
  data?: VSAbonnementsvorm;
  error?: string;
};

const abonnementsvormCreateSchema = z.object({
  naam: z.string().min(1, "Naam is verplicht"),
  tijdsduur: z.number().int().positive("Tijdsduur moet een positief getal zijn"),
  prijs: z.number().nonnegative("Prijs moet een positief getal zijn"),
  bikeparkTypeID: z.string().min(1, "Stallingstype is verplicht"),
  exploitantSiteID: z.string().nullable(),
  idmiddelen: z.string().default("sleutelhanger"),
  isActief: z.boolean().default(true),
  conditionsID: z.string().nullable(),
  biketypeIDs: z.array(z.number()).optional(), // Array of BikeType IDs
});

const abonnementsvormUpdateSchema = z.object({
  naam: z.string().min(1).optional(),
  tijdsduur: z.number().int().positive().optional(),
  prijs: z.number().nonnegative().optional(),
  bikeparkTypeID: z.string().min(1).optional(),
  exploitantSiteID: z.string().nullable().optional(),
  idmiddelen: z.string().optional(),
  isActief: z.boolean().optional(),
  conditionsID: z.string().nullable().optional(),
  contractID: z.string().nullable().optional(),
  paymentAuthorizationID: z.string().nullable().optional(),
  // Note: biketypeIDs is NOT included in update schema (read-only after creation)
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<AbonnementsvormResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"});
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error});
    return;
  }

  // Check if user has access rights
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.instellingen_dataeigenaar)) {
    console.error("Unauthorized - no access rights");
    res.status(403).json({ error: "Geen toegang tot abonnementsvormen" });
    return;
  }

  const { activeContactId } = validateUserSessionResult;

  if (!activeContactId) {
    console.error("Unauthorized - no active contact ID");
    res.status(403).json({ error: "Geen actieve organisatie geselecteerd" });
    return;
  }

  const id = req.query.id as string;

  switch (req.method) {
    case "GET": {
      try {
        if (id === "new") {
          // Return default new abonnementsvorm
          const defaultRecord: VSAbonnementsvorm = {
            ID: 0,
            naam: null,
            omschrijving: null,
            prijs: null,
            tijdsduur: null,
            conditions: null,
            siteID: activeContactId,
            bikeparkTypeID: null,
            isActief: true,
            exploitantSiteID: null,
            idmiddelen: "sleutelhanger",
            contractID: null,
            paymentAuthorizationID: null,
            conditionsID: null,
            hasSubscriptions: false,
            biketypes: [],
          };
          res.status(200).json({data: defaultRecord});
          return;
        }

        const abonnementsvorm = await prisma.abonnementsvormen.findFirst({
          where: {
            ID: parseInt(id),
            siteID: activeContactId
          },
          include: {
            abonnementen: {
              where: {
                isActief: true,
                ingangsdatum: { lte: new Date() },
                afloopdatum: { gte: new Date() }
              },
              select: {
                ID: true
              },
              take: 1
            }
          }
        });

        if (!abonnementsvorm) {
          res.status(404).json({error: "Abonnementsvorm niet gevonden"});
          return;
        }

        const data: VSAbonnementsvorm = {
          ID: abonnementsvorm.ID,
          naam: abonnementsvorm.naam,
          omschrijving: abonnementsvorm.omschrijving,
          prijs: abonnementsvorm.prijs ? Number(abonnementsvorm.prijs) : null,
          tijdsduur: abonnementsvorm.tijdsduur,
          conditions: abonnementsvorm.conditions,
          siteID: abonnementsvorm.siteID,
          bikeparkTypeID: abonnementsvorm.bikeparkTypeID,
          isActief: abonnementsvorm.isActief,
          exploitantSiteID: abonnementsvorm.exploitantSiteID,
          idmiddelen: abonnementsvorm.idmiddelen,
          contractID: abonnementsvorm.contractID,
          paymentAuthorizationID: abonnementsvorm.paymentAuthorizationID,
          conditionsID: abonnementsvorm.conditionsID,
          hasSubscriptions: abonnementsvorm.abonnementen.length > 0,
          biketypes: [], // Fietstypes are fetched separately
        };

        res.status(200).json({data});
      } catch (e) {
        console.error("Error fetching abonnementsvorm:", e);
        res.status(500).json({error: "Fout bij het ophalen van abonnementsvorm"});
      }
      break;
    }
    case "POST": {
      try {
        const parseResult = abonnementsvormCreateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors, null, 2));
          res.status(400).json({ error: parseResult.error.errors.map(e => e.message).join(", ") });
          return;
        }

        const parsed = parseResult.data;

        // Validate exploitantSiteID is in user's accessible sites if provided
        const { sites } = validateUserSessionResult;
        if (parsed.exploitantSiteID && !sites.includes(parsed.exploitantSiteID)) {
          res.status(403).json({ error: "Geen toegang tot deze exploitant" });
          return;
        }

        // Create the abonnementsvorm
        const newAbonnementsvorm = await prisma.abonnementsvormen.create({
          data: {
            naam: parsed.naam,
            tijdsduur: parsed.tijdsduur,
            prijs: parsed.prijs,
            bikeparkTypeID: parsed.bikeparkTypeID,
            siteID: activeContactId,
            exploitantSiteID: parsed.exploitantSiteID || null,
            idmiddelen: parsed.idmiddelen,
            isActief: parsed.isActief,
            conditionsID: parsed.conditionsID || null,
          }
        });

        // Create fietstype associations if provided
        if (parsed.biketypeIDs && parsed.biketypeIDs.length > 0) {
          await prisma.abonnementsvorm_fietstype.createMany({
            data: parsed.biketypeIDs.map(biketypeID => ({
              SubscriptiontypeID: newAbonnementsvorm.ID,
              BikeTypeID: biketypeID,
            }))
          });
        }

        // Fetch the created abonnementsvorm with relations
        const created = await prisma.abonnementsvormen.findFirst({
          where: { ID: newAbonnementsvorm.ID },
          include: {
            abonnementen: {
              where: {
                isActief: true,
                ingangsdatum: { lte: new Date() },
                afloopdatum: { gte: new Date() }
              },
              select: {
                ID: true
              },
              take: 1
            }
          }
        });

        if (!created) {
          res.status(500).json({error: "Fout bij het aanmaken van abonnementsvorm"});
          return;
        }

        const data: VSAbonnementsvorm = {
          ID: created.ID,
          naam: created.naam,
          omschrijving: created.omschrijving,
          prijs: created.prijs ? Number(created.prijs) : null,
          tijdsduur: created.tijdsduur,
          conditions: created.conditions,
          siteID: created.siteID,
          bikeparkTypeID: created.bikeparkTypeID,
          isActief: created.isActief,
          exploitantSiteID: created.exploitantSiteID,
          idmiddelen: created.idmiddelen,
          contractID: created.contractID,
          paymentAuthorizationID: created.paymentAuthorizationID,
          conditionsID: created.conditionsID,
          hasSubscriptions: created.abonnementen.length > 0,
          biketypes: [], // Fietstypes are fetched separately
        };

        res.status(201).json({data});
      } catch (e) {
        console.error("Error creating abonnementsvorm:", e);
        res.status(500).json({error: "Fout bij het aanmaken van abonnementsvorm"});
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = abonnementsvormUpdateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors, null, 2));
          res.status(400).json({ error: parseResult.error.errors.map(e => e.message).join(", ") });
          return;
        }

        const parsed = parseResult.data;

        // Check if abonnementsvorm exists and user has access
        const existing = await prisma.abonnementsvormen.findFirst({
          where: {
            ID: parseInt(id),
            siteID: activeContactId
          }
        });

        if (!existing) {
          res.status(404).json({error: "Abonnementsvorm niet gevonden"});
          return;
        }

        // Validate exploitantSiteID if provided (should be accessible to the user)
        const { sites } = validateUserSessionResult;
        if (parsed.exploitantSiteID !== undefined && parsed.exploitantSiteID !== null && !sites.includes(parsed.exploitantSiteID)) {
          res.status(403).json({ error: "Geen toegang tot deze exploitant" });
          return;
        }

        // Update the abonnementsvorm (note: fietstypes are NOT updated)
        const updateData: any = {};
        if (parsed.naam !== undefined) updateData.naam = parsed.naam;
        if (parsed.tijdsduur !== undefined) updateData.tijdsduur = parsed.tijdsduur;
        if (parsed.prijs !== undefined) updateData.prijs = parsed.prijs;
        if (parsed.bikeparkTypeID !== undefined) updateData.bikeparkTypeID = parsed.bikeparkTypeID;
        if (parsed.exploitantSiteID !== undefined) updateData.exploitantSiteID = parsed.exploitantSiteID;
        if (parsed.idmiddelen !== undefined) updateData.idmiddelen = parsed.idmiddelen;
        if (parsed.isActief !== undefined) updateData.isActief = parsed.isActief;
        if (parsed.conditionsID !== undefined) updateData.conditionsID = parsed.conditionsID;
        if (parsed.contractID !== undefined) updateData.contractID = parsed.contractID;
        if (parsed.paymentAuthorizationID !== undefined) updateData.paymentAuthorizationID = parsed.paymentAuthorizationID;

        await prisma.abonnementsvormen.update({
          where: { ID: parseInt(id) },
          data: updateData
        });

        // Fetch the updated abonnementsvorm with relations
        const updated = await prisma.abonnementsvormen.findFirst({
          where: { ID: parseInt(id) },
          include: {
            abonnementen: {
              where: {
                isActief: true,
                ingangsdatum: { lte: new Date() },
                afloopdatum: { gte: new Date() }
              },
              select: {
                ID: true
              },
              take: 1
            }
          }
        });

        if (!updated) {
          res.status(500).json({error: "Fout bij het bijwerken van abonnementsvorm"});
          return;
        }

        const data: VSAbonnementsvorm = {
          ID: updated.ID,
          naam: updated.naam,
          omschrijving: updated.omschrijving,
          prijs: updated.prijs ? Number(updated.prijs) : null,
          tijdsduur: updated.tijdsduur,
          conditions: updated.conditions,
          siteID: updated.siteID,
          bikeparkTypeID: updated.bikeparkTypeID,
          isActief: updated.isActief,
          exploitantSiteID: updated.exploitantSiteID,
          idmiddelen: updated.idmiddelen,
          contractID: updated.contractID,
          paymentAuthorizationID: updated.paymentAuthorizationID,
          conditionsID: updated.conditionsID,
          hasSubscriptions: updated.abonnementen.length > 0,
          biketypes: [], // Fietstypes are fetched separately
        };

        res.status(200).json({data});
      } catch (e) {
        console.error("Error updating abonnementsvorm:", e);
        res.status(500).json({error: "Fout bij het bijwerken van abonnementsvorm"});
      }
      break;
    }
    case "DELETE": {
      try {
        // Check if abonnementsvorm exists and user has access
        const existing = await prisma.abonnementsvormen.findFirst({
          where: {
            ID: parseInt(id),
            siteID: activeContactId
          },
          include: {
            abonnementen: {
              where: {
                isActief: true,
                ingangsdatum: { lte: new Date() },
                afloopdatum: { gte: new Date() }
              },
              select: {
                ID: true
              },
              take: 1
            }
          }
        });

        if (!existing) {
          res.status(404).json({error: "Abonnementsvorm niet gevonden"});
          return;
        }

        // Check if there are active subscriptions
        if (existing.abonnementen.length > 0) {
          res.status(400).json({error: "Kan abonnementsvorm niet verwijderen: er zijn actieve abonnementen"});
          return;
        }

        // Delete fietstype associations first
        await prisma.abonnementsvorm_fietstype.deleteMany({
          where: {
            SubscriptiontypeID: parseInt(id)
          }
        });

        // Delete the abonnementsvorm
        await prisma.abonnementsvormen.delete({
          where: { ID: parseInt(id) }
        });

        res.status(200).json({});
      } catch (e) {
        console.error("Error deleting abonnementsvorm:", e);
        res.status(500).json({error: "Fout bij het verwijderen van abonnementsvorm"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"});
    }
  }
}

