import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { type VSFietsenstallingLijst, fietsenstallingLijstSelect } from "~/types/fietsenstallingen";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type FietsenstallingenCompactResponse = {
  data?: VSFietsenstallingLijst[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  
  // Check if user has access to fietsenstallingen
  const hasFietsenstallingenAdmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasFietsenstallingenBeperkt = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  const hasFietsenstallingenAccess = hasFietsenstallingenAdmin || hasFietsenstallingenBeperkt;
  
  // if (!hasFietsenstallingenAccess) {
  //   res.status(403).json({ error: "Access denied - insufficient permissions" });
  //   return;
  // }
  
  const validationResult = await validateUserSession(session, "any");
  
  let whereClause: Prisma.fietsenstallingenWhereInput = {
    StallingsID: { not: null },
    Title: { // Never include Systeemstalling
      not: 'Systeemstalling'
    },
    // Exclude stallingen from archived data owners (Status = "0")
    contacts_fietsenstallingen_SiteIDTocontacts: {
      Status: { not: "0" }
    },
  };
  
  if ('error' in validationResult === false) {
    const { GemeenteID } = req.query;
    const { sites } = validationResult;
    whereClause.SiteID = { in: GemeenteID ? [GemeenteID as string] : sites };
  }

  switch (req.method) {
    case "GET": {
      // GET all fietsenstallingen user can access
      const fietsenstallingen = (await prisma.fietsenstallingen.findMany({
        where: whereClause,
        select: fietsenstallingLijstSelect
      })) as unknown as VSFietsenstallingLijst[];
     
      // Convert all BigInt fields to strings
      fietsenstallingen.forEach((fietsenstalling) => {
        Object.keys(fietsenstalling).forEach(key => {
          if (typeof (fietsenstalling as any)[key] === 'bigint') {
            (fietsenstalling as any)[key] = (fietsenstalling as any)[key].toString();
          }
        });
      });
      
      res.status(200).json({data: fietsenstallingen});
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}