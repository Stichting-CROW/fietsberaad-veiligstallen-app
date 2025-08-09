import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { type ParkingDetailsType, selectParkingDetailsType } from "~/types/parking";

export type FietsenstallingenResponse = {
  data?: ParkingDetailsType[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  const validationResult = await validateUserSession(session, "any");
  
  let whereClause: Prisma.fietsenstallingenWhereInput = {
    Title: { // Never include Systeemstalling
      not: 'Systeemstalling'
    },
    StallingsID: { not: null },
  };


  if (!('error' in validationResult)) {
    const { GemeenteID } = req.query;
    const { sites } = validationResult;
    // authenticated user: return stallingen for the user's sites or for a specific GemeenteID when provided
    whereClause.SiteID = { in: GemeenteID ? [GemeenteID as string] : sites };
  } else {
    // public access: return all fietsenstallingen
  }

  switch (req.method) {
    case "GET": {
      // GET all fietsenstallingen user can access
      const fietsenstallingen = (await prisma.fietsenstallingen.findMany({
        where: whereClause,
        select: selectParkingDetailsType
      })) as unknown as ParkingDetailsType[];
     
      // Loop all fietsenstallingen and console.log any that has a BigInt in any of its fields
      // fietsenstallingen.forEach(fietsenstalling => {
      //   Object.keys(fietsenstalling).forEach(key => {
      //     if (typeof fietsenstalling[key] === 'bigint') {
      //       console.log(`BigInt found in field: ${key}`);
      //     }
      //   });
      // });
      
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