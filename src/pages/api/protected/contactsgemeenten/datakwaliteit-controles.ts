import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type DatakwaliteitControleWithRelations = {
  id: string;
  createdAt: Date;
  contact_id: string;
  user_id: string;
  contact: {
    CompanyName: string | null;
  };
  user: {
    DisplayName: string | null;
    UserName: string | null;
  };
};

export type DatakwaliteitControlesResponse = {
  data?: DatakwaliteitControleWithRelations[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<DatakwaliteitControlesResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ("error" in validateUserSessionResult) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasFietsberaadAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_admin
  );
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );
  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    res.status(403).json({ error: "Forbidden: fietsberaad_admin or fietsberaad_superadmin required" });
    return;
  }

  try {
    const controles = await prisma.contacts_datakwaliteitcontroles.findMany({
      include: {
        contact: {
          select: { CompanyName: true },
        },
        user: {
          select: { DisplayName: true, UserName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      data: controles as unknown as DatakwaliteitControleWithRelations[],
    });
  } catch (e) {
    console.error("datakwaliteit-controles - error:", e);
    res.status(500).json({ error: "Failed to fetch datakwaliteit-controles" });
  }
}
