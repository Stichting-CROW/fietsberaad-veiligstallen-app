import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSTariefcode, tariefcodeSelect } from "~/types/tariefcodes";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { tariefcodeCreateSchema } from "~/types/tariefcodes";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type TariefcodesResponse = {
  data?: VSTariefcode[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TariefcodesResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  // Check user has fietsberaad_admin or fietsberaad_superadmin rights
  const hasFietsberaadAdmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasFietsberaadSuperadmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  
  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    console.error("Unauthorized - insufficient permissions");
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  switch (req.method) {
    case "GET": {
      // GET all tariefcodes
      const tariefcodes = await prisma.tariefcodes.findMany({
        select: tariefcodeSelect,
        orderBy: {
          ID: 'asc'
        }
      });

      res.status(200).json({ data: tariefcodes as VSTariefcode[] });
      break;
    }
    case "POST": {
      // Create new tariefcode
      try {
        const parseResult = tariefcodeCreateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors, null, 2));
          res.status(400).json({ error: parseResult.error.errors.map(e => e.message).join(", ") });
          return;
        }

        const newTariefcode = await prisma.tariefcodes.create({
          data: parseResult.data,
          select: tariefcodeSelect,
        });

        res.status(201).json({ data: [newTariefcode as VSTariefcode] });
      } catch (error) {
        console.error("Error creating tariefcode:", error);
        res.status(500).json({ error: "Internal server error" });
      }
      break;
    }
    default: {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  }
}

