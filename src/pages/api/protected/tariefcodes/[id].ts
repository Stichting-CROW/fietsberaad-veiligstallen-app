import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSTariefcode, tariefcodeSelect } from "~/types/tariefcodes";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { tariefcodeUpdateSchema } from "~/types/tariefcodes";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type TariefcodeResponse = {
  data?: VSTariefcode;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<TariefcodeResponse>
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

  const id = req.query.id as string;
  const tariefcodeId = parseInt(id);

  if (isNaN(tariefcodeId) && id !== "new") {
    res.status(400).json({ error: "Invalid tariefcode ID" });
    return;
  }

  switch (req.method) {
    case "GET": {
      if (id === "new") {
        // Return template for new tariefcode
        const defaultRecord: VSTariefcode = {
          ID: 0,
          Omschrijving: "",
        };
        res.status(200).json({ data: defaultRecord });
        return;
      }

      const tariefcode = await prisma.tariefcodes.findUnique({
        where: { ID: tariefcodeId },
        select: tariefcodeSelect,
      });

      if (!tariefcode) {
        res.status(404).json({ error: "Tariefcode not found" });
        return;
      }

      res.status(200).json({ data: tariefcode as VSTariefcode });
      break;
    }
    case "PUT": {
      // Update existing tariefcode
      try {
        const parseResult = tariefcodeUpdateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Ongeldige of ontbrekende gegevens:", JSON.stringify(parseResult.error.errors, null, 2));
          res.status(400).json({ error: parseResult.error.errors.map(e => e.message).join(", ") });
          return;
        }

        // Check if tariefcode exists
        const existingTariefcode = await prisma.tariefcodes.findUnique({
          where: { ID: tariefcodeId },
        });

        if (!existingTariefcode) {
          res.status(404).json({ error: "Tariefcode not found" });
          return;
        }

        // Only update Omschrijving, ID is only for the where clause
        const updatedTariefcode = await prisma.tariefcodes.update({
          where: { ID: tariefcodeId },
          data: {
            Omschrijving: parseResult.data.Omschrijving,
          },
          select: tariefcodeSelect,
        });

        res.status(200).json({ data: updatedTariefcode as VSTariefcode });
      } catch (error) {
        console.error("Error updating tariefcode:", error);
        res.status(500).json({ error: "Internal server error" });
      }
      break;
    }
    case "DELETE": {
      // Delete tariefcode
      try {
        // Check if tariefcode exists
        const existingTariefcode = await prisma.tariefcodes.findUnique({
          where: { ID: tariefcodeId },
        });

        if (!existingTariefcode) {
          res.status(404).json({ error: "Tariefcode not found" });
          return;
        }

        // Check if tariefcode is in use (referenced by fietsenstallingen)
        const inUse = await prisma.fietsenstallingen.count({
          where: { Tariefcode: tariefcodeId }
        }) > 0;

        if (inUse) {
          res.status(400).json({ error: "Deze tariefcode is in gebruik en kan daarom niet verwijderd worden" });
          return;
        }

        await prisma.tariefcodes.delete({
          where: { ID: tariefcodeId },
        });

        res.status(200).json({ data: undefined });
      } catch (error) {
        console.error("Error deleting tariefcode:", error);
        res.status(500).json({ error: "Internal server error" });
      }
      break;
    }
    default: {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  }
}

