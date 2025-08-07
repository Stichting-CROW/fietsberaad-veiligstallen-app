import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { gemeenteSelect } from "~/types/contacts";
// import { authOptions } from './auth/[...nextauth]'
// import { getServerSession } from "next-auth/next"


export default async (request: NextApiRequest, response: NextApiResponse) => {
  // const session = await getServerSession(request, response, authOptions)

  // // console.log("#### create stalling - get session");
  // if (session && session.user) {
  //   // console.log("#### create stalling while logged in");
  //   // console.log(`#### req ${JSON.stringify(Object.keys(request), null, 2)}`);
  // } else {
  //   console.log("#### create stalling while not logged in");
  // }
  console.log("/api/contacts", request.query);
  switch (request.method) {
    case "GET": {
      const queryparams = request.query;
      if(queryparams.itemType) {
        const itemType = queryparams.itemType as string;
        const items = await prisma.contacts.findMany({
          where: {
            ItemType: itemType
          },
          select: gemeenteSelect
        });
        response.status(200).json(items);
      }
      else if (queryparams.cbsCode) {
        const cbsCode = queryparams.cbsCode as string;
        const municipality = await prisma.contacts.findFirst({
          where: {
            Gemeentecode: Number(cbsCode)
          },
          select: gemeenteSelect
        });
        response.status(200).json([municipality]);
      }
      else if (queryparams.urlName) {
        const urlName = queryparams.urlName as string;
        const municipality = await prisma.contacts.findFirst({
          where: {
            UrlName: urlName
          },
          select: gemeenteSelect
        });
        response.status(200).json([municipality]);
      }
      else if (queryparams.ID) {
        const ID = queryparams.ID as string;
        const municipality = await prisma.contacts.findFirst({
          where: {
            ID: ID
          },
          select: gemeenteSelect
        });
        response.status(200).json(municipality);
      } else {
        response.status(400).json({ error: "Missing or unsupported query parameter" });
      }
      break;
    }
    default: {// not implemented
      response.status(405).json({ error: 'Method not implemented' });
      break;
    }
  }
};
