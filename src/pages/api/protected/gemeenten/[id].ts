import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { gemeenteSchema, gemeenteCreateSchema, getDefaultNewGemeente } from "~/types/database";
import { type VSContactGemeente, gemeenteSelect, VSContactItemType } from "~/types/contacts";

export type GemeenteResponse = {
  data?: VSContactGemeente;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  const { sites, userId } = validateUserSessionResult;

  const id = req.query.id as string;
  if (!sites.includes(id) && id !== "new") {
    console.error("Unauthorized - no access to this organization", id);
    res.status(403).json({ error: "Geen toegang tot deze organisatie" });
    return;
  }

  switch (req.method) {
    case "GET": {
      if (id === "new") {
        // add timestamp to the name
        const defaultRecord = getDefaultNewGemeente('Nieuw ' + new Date().toISOString());
        res.status(200).json({data: defaultRecord});
        return;
      }

      const gemeente = (await prisma.contacts.findFirst({
        where: {
          ID: id,
          ItemType: VSContactItemType.Organizations,
        },
        select: gemeenteSelect
      })) as unknown as VSContactGemeente;
      res.status(200).json({data: gemeente});
      break;
    }
    case "POST": {
      try {
        const newID = generateID();
        const data = { ...req.body, ID: newID };

        const parseResult = gemeenteCreateSchema.safeParse(data);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors,null,2));
          res.status(400).json({ error: parseResult.error.errors });
          return;
        }
        const parsed = parseResult.data;

        const newData = {
          ID: newID,
          // Required fields
          ItemType: VSContactItemType.Organizations,
          CompanyName: parsed.CompanyName,
          Status: "1", // Default status
            
          // Optional fields with defaults
          AlternativeCompanyName: parsed.AlternativeCompanyName ?? undefined,
          UrlName: parsed.UrlName ?? undefined,
          ZipID: parsed.ZipID ?? undefined,
          Helpdesk: parsed.Helpdesk ?? undefined,
          CompanyLogo: parsed.CompanyLogo ?? undefined,
          CompanyLogo2: parsed.CompanyLogo2 ?? undefined,
          ThemeColor1: parsed.ThemeColor1 ?? "1f99d2", // Default theme color
          ThemeColor2: parsed.ThemeColor2 ?? "96c11f", // Default theme color
          DayBeginsAt: parsed.DayBeginsAt ?? new Date("00:00:00"), // Default day begins at
          Coordinaten: parsed.Coordinaten ?? undefined,
          Zoom: parsed.Zoom ?? 12, // Default zoom level
          Bankrekeningnr: parsed.Bankrekeningnr ?? undefined,
          PlaatsBank: parsed.PlaatsBank ?? undefined,
          Tnv: parsed.Tnv ?? undefined,
          Notes: parsed.Notes ?? undefined,
          DateRegistration: parsed.DateRegistration ?? undefined,
        }

        const newOrg = await prisma.contacts.create({data: newData, select: gemeenteSelect}) as unknown as VSContactGemeente;
        if(!newOrg) {
          console.error("Fout bij het aanmaken van nieuwe gemeente:", newData);
          res.status(500).json({error: "Fout bij het aanmaken van nieuwe gemeente"});
          return;
        }

        res.status(201).json({ 
          data: [newOrg]
        });
      } catch (e) {
        console.error("Fout bij het aanmaken van gemeente:", e);
        res.status(500).json({error: "Fout bij het aanmaken van gemeente"});
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = gemeenteSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({error: "Ongeldige of ontbrekende gegevens"});
          return;
        }

        const parsed = parseResult.data;
        const updatedOrg = await prisma.contacts.update({
          select: gemeenteSelect,
          where: { ID: id },
          data: {
            CompanyName: parsed.CompanyName,
            ItemType: VSContactItemType.Organizations,
            AlternativeCompanyName: parsed.AlternativeCompanyName ?? undefined,
            UrlName: parsed.UrlName ?? undefined,
            ZipID: parsed.ZipID ?? undefined,
            Helpdesk: parsed.Helpdesk ?? undefined,
            CompanyLogo: parsed.CompanyLogo ?? undefined,
            CompanyLogo2: parsed.CompanyLogo2 ?? undefined,
            ThemeColor1: parsed.ThemeColor1 ?? undefined,
            ThemeColor2: parsed.ThemeColor2 ?? undefined,
            DayBeginsAt: parsed.DayBeginsAt ? new Date(parsed.DayBeginsAt) : undefined,
            Coordinaten: parsed.Coordinaten ?? undefined,
            Zoom: parsed.Zoom ?? undefined,
            Bankrekeningnr: parsed.Bankrekeningnr ?? undefined,
            PlaatsBank: parsed.PlaatsBank ?? undefined,
            Tnv: parsed.Tnv ?? undefined,
            Notes: parsed.Notes ?? undefined,
            DateRegistration: parsed.DateRegistration === null ? null : parsed.DateRegistration ? new Date(parsed.DateRegistration) : undefined,
            DateConfirmed: parsed.DateConfirmed === null ? null : parsed.DateConfirmed ? new Date(parsed.DateConfirmed) : undefined,
            DateRejected: parsed.DateRejected === null ? null : parsed.DateRejected ? new Date(parsed.DateRejected) : undefined,
          }
        });
        res.status(200).json({data: updatedOrg});
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(e.errors,null,2));
          res.status(400).json({ error: e.errors });
        } else {
          res.status(500).json({error: "Fout bij het bijwerken van de gemeente"});
        }
      }
      break;
    }
    case "DELETE": {
      try {
        await prisma.contacts.delete({
          where: { ID: id }
        });
        res.status(200).json({});
      } catch (e) {
        console.error("Fout bij het verwijderen van de gemeente:", e);
        res.status(500).json({error: "Fout bij het verwijderen van de gemeente"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"}); // Method Not Allowed
    }
  }
}