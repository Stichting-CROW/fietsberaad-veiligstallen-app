import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { VSUserRoleValuesNew, type VSUserWithRolesNew} from "~/types/users";
import { securityUserSelect, VSUserGroupValues, VSUserWithRoles } from "~/types/users-coldfusion";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { createSecurityProfile } from "~/utils/server/securitycontext";
import { SecurityUsersResponse } from "../index";
import { validateUserSession } from "~/utils/server/database-tools";
import { getOrganisationTypeByID } from "~/utils/server/database-tools";

const getAllUsers = async (): Promise<VSUserWithRolesNew[]> => {
  const allusers = (await prisma.security_users.findMany({
    select: securityUserSelect,
    orderBy: { UserID: 'asc' }
  }))
  const result = await Promise.all(allusers.map(async user => { 
      const theRoleInfo = user.user_contact_roles.find((role) => role.isOwnOrganization);
      const currentRoleID: VSUserRoleValuesNew = theRoleInfo?.NewRoleID as VSUserRoleValuesNew || VSUserRoleValuesNew.None;
      const isContact = user.security_users_sites.some((site) => site.SiteID === theRoleInfo?.ContactID && site.IsContact);

      const contactType = await getOrganisationTypeByID(theRoleInfo?.ContactID || "");

      // const contactType = null;

      const newUserData: VSUserWithRolesNew = {
        UserID: user.UserID, 
        UserName: user.UserName, 
        DisplayName: user.DisplayName, 
        Status: user.Status, 
        LastLogin: user.LastLogin, 
        // EncryptedPassword: user.EncryptedPassword, 
        // EncryptedPassword2: user.EncryptedPassword2,
        // sites: getSitesForUser(user),
        securityProfile: createSecurityProfile(currentRoleID, contactType),
        isContact: isContact,
        ownOrganizationID: theRoleInfo?.ContactID || "",
        isOwnOrganization: true,
      }
        return newUserData;
    }))
    .then(users => users.filter(user => user.DisplayName !== "")); // filter out users without a name or organization

    return result;
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SecurityUsersResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  const validateUserSessionResult = await validateUserSession(session, "any");
  
  if ('error' in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({error: `validate user session error:${validateUserSessionResult.status} - ${validateUserSessionResult.error}`});
    return;
  }

  switch (req.method) {
    case "GET": {
      // GET all security users in their own organization scope
      const allUsers = await getAllUsers();
      res.status(200).json({data: allUsers});
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
}