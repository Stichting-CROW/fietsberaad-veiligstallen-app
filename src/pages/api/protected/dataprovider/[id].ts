import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession, updateSecurityProfile } from "~/utils/server/database-tools";
import { dataproviderSchema, dataproviderCreateSchema, getDefaultNewDataprovider } from "~/types/database";
import { type VSUserWithRoles, securityUserSelect } from "~/types/users";
import { type VSContactDataprovider, dataproviderSelect } from "~/types/contacts";

export type DataproviderResponse = {
  data?: VSContactDataprovider;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Unauthorized - no session found"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "dataprovider");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(validateUserSessionResult.status).json({error: `validate user session error:${validateUserSessionResult.status} - ${validateUserSessionResult.error}`});
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
        const defaultRecord = getDefaultNewDataprovider('Testdataprovider ' + new Date().toISOString());
        res.status(200).json({data: defaultRecord});
        return;
      }

      const dataprovider = (await prisma.contacts.findFirst({
        where: {
          ID: id,
          ItemType: "dataprovider",
        },
        select: dataproviderSelect
      })) as unknown as VSContactDataprovider;
      res.status(200).json({data: dataprovider});
      break;
    }
    case "POST": {
      try {
        const newID = generateID();
        const data = { ...req.body, ID: newID };

        const parseResult = dataproviderCreateSchema.safeParse(data);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors,null,2));
          res.status(400).json({ error: parseResult.error.errors });
          return;
        }
        const parsed = parseResult.data;

        const newData: VSContactDataprovider = {
          ID: newID,
          CompanyName: parsed.CompanyName,
          ItemType: "dataprovider",
          UrlName: parsed.UrlName ?? null,
          Password: parsed.Password ?? null,
          Status: "1", // Default: Enabled
          DateRegistration: new Date(),
          DateConfirmed: null,
          DateRejected: null
        }

        const newOrg = await prisma.contacts.create({data: newData, select: dataproviderSelect}) as unknown as VSContactDataprovider;
        if(!newOrg) {
          console.error("Fout bij het aanmaken van nieuwe dataprovider:", newData);
          res.status(500).json({error: "Fout bij het aanmaken van nieuwe dataprovider"});
          return;
        }

        // add a record to the security_users_sites table that links the new organization to the user's sites
        const newLink = await prisma.security_users_sites.create({
          data: {
            UserID: userId,
            SiteID: newOrg.ID,
            IsContact: false
          }
        });

        if(!newLink) {
          console.error("Fout bij het aanmaken van koppeling naar nieuwe dataprovider:", newOrg.ID);
          res.status(500).json({error: "Fout bij het aanmaken van koppeling naar nieuwe dataprovider"});
          return;
        }

        // Update security profile
        const { session: updatedSession, error: profileError } = await updateSecurityProfile(session, userId);
        if (profileError) {
          console.error("Fout bij het bijwerken van beveiligingsprofiel:", profileError);
          res.status(500).json({error: profileError});
          return;
        }

        res.status(201).json({ 
          data: [newOrg],
          session: updatedSession
        });
      } catch (e) {
        console.error("Fout bij het aanmaken van dataprovider:", e);
        res.status(500).json({ error: "Fout bij het aanmaken van dataprovider" });
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = dataproviderSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors,null,2));
          res.status(400).json({ error: "Ongeldige of ontbrekende gegevens:" });
          return;
        }

        const parsed = parseResult.data;
        const updatedOrg = await prisma.contacts.update({
          select: dataproviderSelect,
          where: { ID: id },
          data: {
            CompanyName: parsed.CompanyName,
            ItemType: "dataprovider",
            UrlName: parsed.UrlName ?? undefined,
            Password: parsed.Password ?? undefined,
            Status: parsed.Status ?? undefined,
          }
        });
        res.status(200).json({ data: updatedOrg});
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(e.errors,null,2));
          res.status(400).json({ error: e.errors });
        } else {
          res.status(500).json({ error: "Fout bij het bijwerken van dataprovider" });
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
        console.error("Fout bij het verwijderen van dataprovider:", e);
        res.status(500).json({ error: "Fout bij het verwijderen van dataprovider" });
      }
      break;
    }
    default: {
      res.status(405).json({ error: "Methode niet toegestaan" }); // Method Not Allowed
    }
  }
} 