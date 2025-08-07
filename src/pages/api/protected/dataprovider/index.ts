import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSContactDataprovider, VSContactItemType, dataproviderSelect } from "~/types/contacts";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";

export type DataprovidersResponse = {
  data?: VSContactDataprovider[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  const validateUserSessionResult = await validateUserSession(session, "dataprovider");
  
  if ('error' in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({dataproviders: []});
    return;
  }

  const { sites } = validateUserSessionResult;

  switch (req.method) {
    case "GET": {
      // GET all dataproviders user can access
      const dataproviders = (await prisma.contacts.findMany({
        where: {
          ItemType: VSContactItemType.Dataprovider,
          ID: { in: sites }
        },
        select: dataproviderSelect
      })) as unknown as VSContactDataprovider[];
      
      res.status(200).json({data: dataproviders});
      break;
    }
    default: {
      res.status(405).json({error: "Methode niet toegestaan"}); // Method Not Allowed
    }
  }
} 