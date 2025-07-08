// import type { NextApiRequest, NextApiResponse } from "next";
// import { prisma } from "~/server/db";
// import { type VSFietsenstalling } from "~/types/fietsenstallingen";
// import { getServerSession } from "next-auth";
// import { authOptions } from '~/pages/api/auth/[...nextauth]'
// import { validateUserSession } from "~/utils/server/database-tools";
// import { fietsenstallingSchema, fietsenstallingCreateSchema } from "~/types/fietsenstallingen";

// export type FietsenstallingValidateResponse = {
//   valid: boolean;
//   message: string;
// };

// export default async function handle(
//   req: NextApiRequest,
//   res: NextApiResponse
// ) {
//   const session = await getServerSession(req, res, authOptions);
//   if (!session?.user) {
//     console.error("Niet geautoriseerd - geen sessie gevonden");
//     res.status(401).json({valid: false, error: "Niet geautoriseerd - geen sessie gevonden"}); // Unauthorized
//     return;
//   }

//   const validateUserSessionResult = await validateUserSession(session, "any");
//   if ('error' in validateUserSessionResult) {
//     console.error("Niet geautoriseerd - ongeldige sessie", validateUserSessionResult.error);
//     res.status(401).json({valid: false, error: validateUserSessionResult.error}); // Unauthorized
//     return;
//   }

//   const { sites } = validateUserSessionResult;

//   // get id from the query params and the data from the body
//   const data = req.body as VSFietsenstalling | undefined;
//   if(!data) {
//     console.error("Geen data opgegeven");
//     res.status(400).json({valid: false, message: "Geen data opgegeven"});
//     return;
//   }

//   if(!data.ID) {
//     console.error("Geen id opgegeven");
//     res.status(200).json({valid: false, message: "Geen id opgegeven"});
//     return;
//   }

//   const id = data.ID;
//   // user has access to this stalling if the SiteID for this site is 
//   // in the sites array 
//   if(id!=='new') {
//     const tmpstalling = await prisma.fietsenstallingen.findFirst({
//       where: {
//         ID: id
//       }
//     });

//     if(!tmpstalling || !tmpstalling.SiteID || !sites.includes(tmpstalling.SiteID)) {
//       console.error("Unauthorized - no access to this organization", id);
//       res.status(403).json({ error: "No access to this organization" });
//       return;
//     }
//   }

//   switch (req.method) {
//     case "POST": {
//       // check data against zod schema
//       let parseResult;
//       const isNew = data.ID === "new";
//       if(isNew) {
//         parseResult = fietsenstallingCreateSchema.safeParse(data); // Use create schema for new records
//       } else {
//         parseResult = fietsenstallingSchema.safeParse(data);
//       }

//       if (!parseResult.success) {
//         console.error("Invalid data", parseResult.error.issues.map(e => e.path + ':' + e.message).join(", "));
//         res.status(200).json({valid: false, message: parseResult.error.issues.map(e => e.path + ':' + e.message).join(", ")});
//         return;
//       }

//       // Check for unique fields
//       const uniqueFields: {field: keyof VSFietsenstalling, message: string}[] = [
//         {field: "StallingsID", message: "Er bestaat al een fietsenstalling met dit stallingsID"},
//         {field: "StallingsIDExtern", message: "Er bestaat al een fietsenstalling met dit externe stallingsID"}
//       ];

//       const oldValues = !isNew ? await prisma.fietsenstallingen.findUnique({
//         where: {
//           ID: data.ID,
//         }
//       }) : undefined;

//       for(const field of uniqueFields) {
//         const isChanged = oldValues && (oldValues?.[field.field] !== data[field.field]);
//         // check if the field value has changed
//         if(isNew || isChanged) {
//           const duplicate = await prisma.fietsenstallingen.findFirst({
//             where: {
//               [field.field]: data[field.field],
//             },
//           });

//           if(duplicate) {
//             res.status(200).json({valid: false, message: field.message});
//             return;
//           }      
//         }
//       }

//       res.status(200).json({valid: true, message: ""});
//       break;
//     }
//    default: {
//       res.status(405).json({valid: false, message: "Deze methode is niet toegestaan"}); // Method Not Allowed
//     }
//   }
// } 