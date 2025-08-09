import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { VSUserRoleValuesNew, type VSUserWithRolesNew} from "~/types/users";
import { securityUserSelect, VSUserGroupValues, VSUserWithRoles } from "~/types/users-coldfusion";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { getOrganisationTypeByID, validateUserSession } from "~/utils/server/database-tools";
import { createSecurityProfile } from "~/utils/server/securitycontext";

export type SecurityUsersResponse = {
  data?: VSUserWithRolesNew[];
  error?: string;
};

export const securityUserCreateSchema = z.object({
  UserName: z.string().min(1),
  DisplayName: z.string().min(1),
  RoleID: z.number(),
  GroupID: z.string().optional(),
  Status: z.string().optional(),
  Password: z.string().min(1),
});

export interface VSUsersForContact {
  ID: string;
  Name: string;
  Organization: string;
  NewRoleID: string;
}

const getUsersForContact = async (contactID: string): Promise<VSUserWithRolesNew[]> => {
  const linkedusers = (await prisma.security_users.findMany({
    where: { user_contact_roles: { some: { ContactID: contactID } } },
    select: securityUserSelect,
    orderBy: { UserID: 'asc' }
  }));

  const contactType = await getOrganisationTypeByID(contactID);

  const result = linkedusers
    .map(user => { 
      // info related to the own organization of this user
      const ownRoleInfo = user.user_contact_roles.find((role) => role.isOwnOrganization)

      // inforelated to the current contact
      const theRoleInfo = user.user_contact_roles.find((role) => role.ContactID === contactID)
      const currentRoleID: VSUserRoleValuesNew = theRoleInfo?.NewRoleID as VSUserRoleValuesNew || VSUserRoleValuesNew.None;
      const isContact = user.security_users_sites.some((site) => site.SiteID === contactID && site.IsContact);
      const isOwnOrganization = theRoleInfo?.isOwnOrganization || false;

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
        ownOrganizationID: ownRoleInfo?.ContactID || "",
        isOwnOrganization: isOwnOrganization,
      }
        return newUserData;
    })
    .filter(user => user.DisplayName !== ""); // filter out users without a name or organization

  

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

  const { activeContactId } = validateUserSessionResult;
  const  contactId = req.query.contactId as unknown as string; // optional: get users for a specific contact, 

  const selectedContactId = contactId || activeContactId;

  switch (req.method) {
    case "GET": {
      // GET all security users
      const newUsers = await getUsersForContact(selectedContactId);
      res.status(200).json({data: newUsers});
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
}