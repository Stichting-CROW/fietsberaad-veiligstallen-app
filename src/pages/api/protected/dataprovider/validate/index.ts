import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSContactDataprovider, dataproviderSelect } from "~/types/contacts";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { dataproviderSchema } from "~/types/database";

export type DataproviderValidateResponse = {
  valid: boolean;
  message: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Niet geautoriseerd - geen sessie gevonden");
    res.status(401).json({valid: false, error: "Niet geautoriseerd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ('error' in validateUserSessionResult) {
    console.error("Niet geautoriseerd - ongeldige sessie", validateUserSessionResult.error);
    res.status(401).json({valid: false, error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  // get id from the query params and the data from the body
  const data = req.body as VSContactDataprovider | undefined;
  if(!data) {
    res.status(400).json({valid: false, message: "Geen data opgegeven"});
    return;
  }


  if(!data.ID) {
    res.status(200).json({valid: false, message: "Geen id opgegeven"});
    return;
  }

  if (!validateUserSessionResult.sites.includes(data.ID) && data.ID !== "new") {
    res.status(403).json({ valid: false, error: "Geen toegang tot deze organisatie" });
    return;
  }

  switch (req.method) {
    case "POST": {
      // check data against zod schema
      let parseResult;
      const isNew = data.ID === "new";
      if(isNew) {
        parseResult = dataproviderSchema.omit({ID: true}).safeParse(data); // will be set later
      } else {
        parseResult = dataproviderSchema.safeParse(data);
      }

      if (!parseResult.success) {
        res.status(200).json({valid: false, message: parseResult.error.issues.map(e => e.message).join(", ")});
        return;
      }

      // Formally in the old code, the unique key for CompanyName was ItemType, CompanyName, but there are no cases 
      // where an organization name is used with multiple itemtypes, so this will work.
      const uniqueFields: {field: keyof VSContactDataprovider, message: string}[] = [
        {field: "CompanyName", message: "Er bestaat al een dataleverancier met deze naam"},
        {field: "UrlName", message: "Deze ContractorID bestaat al"}
      ];

      const oldValues = !isNew ? await prisma.contacts.findUnique({
        where: {
          ID: data.ID,
        },
        select: dataproviderSelect
      }) : undefined;

      for(const field of uniqueFields) {
        const isChanged = oldValues && (oldValues?.[field.field] !== data[field.field]);
        // check if the field value has changed
        if(isNew || isChanged) {
          const duplicate = await prisma.contacts.findFirst({
            where: {
              [field.field]: data[field.field],
            },
          });

          if(duplicate) {
            res.status(200).json({valid: false, message: `${data[field.field]} - ${field.message}`});
            return;
          }      
        }
      }

      res.status(200).json({valid: true, message: ""});
      break;
    }
   default: {
      res.status(405).json({valid: false, message: "Deze methode is niet toegestaan"}); // Method Not Allowed
    }
  }
}