import type { NextApiRequest, NextApiResponse } from "next";
import { VSUserRoleValuesNew } from "~/types/users";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { getSecurityUserNew } from "~/utils/server/security-users-tools";
import { SecurityUserResponse } from "../index";
import { validateUserSession } from "~/utils/server/database-tools";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SecurityUserResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("** SECURITY_USERS - GET - Unauthorized - no session found");
    res.status(401).json({error: "Unauthorized - no session found"});
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    console.error("** SECURITY_USERS - GET - Unauthorized - validateUserSessionResult", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error});
    return;
  }

  const id = req.query.id as string;

  if(![VSUserRoleValuesNew.Admin, VSUserRoleValuesNew.RootAdmin].includes(session.user.securityProfile.roleId)) {
    console.error("** SECURITY_USERS - GET - Unauthorized - admin user required", session.user.securityProfile.roleId);
    res.status(403).json({error: "Unauthorized - admin user required"});
    return;
  }

  const scopeID = req.query.scopeID as string;
  if(!scopeID) {
    console.error("** SECURITY_USERS WITH SCOPE - no scopeID provided");
    res.status(400).json({error: "No scopeID provided"});
    return;
  }

  switch (req.method) {
    case "GET": {
      const user = await getSecurityUserNew(id, scopeID)
      res.status(200).json({data: user || undefined});
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
}