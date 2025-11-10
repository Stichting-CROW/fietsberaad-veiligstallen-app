import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { gemeenteSchema, gemeenteCreateSchema, getDefaultNewGemeente } from "~/types/database";
import { type VSContactGemeente, gemeenteSelect, VSContactItemType } from "~/types/contacts";
import { VSUserRoleValuesNew } from "~/types/users";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

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

  // Contact validation: Check if user has access to this contact
  const { sites } = validateUserSessionResult;
  const id = req.query.id as string;
  if (!sites.includes(id) && id !== "new") {
    console.error("Unauthorized - no access to this organization", id);
    res.status(403).json({ error: "Geen toegang tot deze organisatie" });
    return;
  }

  // Rights validation: GET is allowed for all users, other methods require instellingen_dataeigenaar right
  if(req.method !== 'GET' && !userHasRight(session.user.securityProfile, VSSecurityTopic.instellingen_dataeigenaar)) {
    console.error("Unauthorized - no correct access rights", id);
    res.status(403).json({ error: "Geen toegang tot deze organisatie - geen correcte rechten" });
    return;
  }

  switch (req.method) {
    case "GET": {
      if (id === "new") {
        // add timestamp to the name
        const defaultRecord = getDefaultNewGemeente("Data-eigenaar " + new Date().toISOString().slice(0, 16).replace('T', ' '));
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

        const fietsberaadusers = await prisma.user_contact_role.findMany({
          where: {
            ContactID: "1",
            NewRoleID: {
              in: [VSUserRoleValuesNew.RootAdmin] // VSUserRoleValuesNew.Admin, 
            }
          },
          select: {
            UserID: true,
            NewRoleID: true,
          }
        });

        // Give fietsberaad admins immediate access to the new exploitant
        for(const fbuser of fietsberaadusers) {
          await prisma.user_contact_role.create({
            data: {
              ID: generateID(),
              UserID: fbuser.UserID,
              ContactID: newID,
              NewRoleID: [VSUserRoleValuesNew.Admin, VSUserRoleValuesNew.RootAdmin].includes(fbuser.NewRoleID as VSUserRoleValuesNew) ? fbuser.NewRoleID : VSUserRoleValuesNew.None,
              isOwnOrganization: false,
            }
          });
        }

        res.status(201).json({ 
          data: newOrg
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
        
        // Check if user is a fietsberaad admin (mainContactId === "1")
        const isFietsberaadAdmin = session.user.mainContactId === "1";
        
        // Build update data, excluding restricted fields for non-fietsberaad admins
        const updateData: any = {
          CompanyName: parsed.CompanyName,
          ItemType: VSContactItemType.Organizations,
          Helpdesk: parsed.Helpdesk ?? undefined,
          CompanyLogo: parsed.CompanyLogo ?? undefined,
          CompanyLogo2: parsed.CompanyLogo2 ?? undefined,
          ThemeColor1: parsed.ThemeColor1 ?? undefined,
          ThemeColor2: parsed.ThemeColor2 ?? undefined,
          DayBeginsAt: parsed.DayBeginsAt ? new Date(parsed.DayBeginsAt) : undefined,
          Coordinaten: parsed.Coordinaten !== undefined ? parsed.Coordinaten : undefined,
          Zoom: parsed.Zoom !== undefined ? parsed.Zoom : undefined,
          Bankrekeningnr: parsed.Bankrekeningnr ?? undefined,
          PlaatsBank: parsed.PlaatsBank ?? undefined,
          Tnv: parsed.Tnv ?? undefined,
          Notes: parsed.Notes ?? undefined,
          DateRegistration: parsed.DateRegistration === null ? null : parsed.DateRegistration ? new Date(parsed.DateRegistration) : undefined,
          DateConfirmed: parsed.DateConfirmed === null ? null : parsed.DateConfirmed ? new Date(parsed.DateConfirmed) : undefined,
          DateRejected: parsed.DateRejected === null ? null : parsed.DateRejected ? new Date(parsed.DateRejected) : undefined,
        };

        // Only allow fietsberaad admins to update restricted fields
        if (isFietsberaadAdmin) {
          updateData.AlternativeCompanyName = parsed.AlternativeCompanyName ?? undefined;
          updateData.UrlName = parsed.UrlName ?? undefined;
          updateData.ZipID = parsed.ZipID ?? undefined;
        }

        const updatedOrg = await prisma.contacts.update({
          select: gemeenteSelect,
          where: { ID: id },
          data: updateData
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
        // Fetch all users for this contact
        const users = await prisma.user_contact_role.findMany({
          where: {
            ContactID: id,
            isOwnOrganization: true
          },
          select: {
            UserID: true
          }
        });

        const userIDs = users.map((user) => user.UserID);

        // delete all role assignments that manage this contact
        await prisma.user_contact_role.deleteMany({
          where: {
            ContactID: id,
          }
        });

        // delete all users that have a role assignment for this contact
        await prisma.security_users.deleteMany({
          where: {
            UserID: { in: userIDs },
          }
        });

        // delete all contact_contact records for this contact
        await prisma.contact_contact.deleteMany({
          where: {
            childSiteID: id
          }
        });

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