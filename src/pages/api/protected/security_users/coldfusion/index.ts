import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSUserWithRoles } from "~/types/users-coldfusion";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { securityUserSelect } from "~/types/users-coldfusion";

export type SecurityUsersColdfusionResponse = {
  data?: VSUserWithRoles[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SecurityUsersColdfusionResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  const validateUserSessionResult = await validateUserSession(session, "any");
  
  if ('error' in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({error: `validate user session error:${validateUserSessionResult.status} - ${validateUserSessionResult.error}`});
    return;
  }

  const { sites } = validateUserSessionResult;

  switch (req.method) {
    case "GET": {
      // GET all security users
      const users = await prisma.security_users.findMany({
        where: {
          // OR: [
          //   { SiteID: { in: sites } },
          //   { GroupID: { in: sites } }
          // ]
        },
        select: securityUserSelect
      }) as VSUserWithRoles[];

      res.status(200).json({data: users});
      break;
    }
  default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
} 