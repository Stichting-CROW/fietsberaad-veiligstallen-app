import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "~/server/db";
import { createSecurityProfile } from "~/utils/server/securitycontext";
import { type VSUserWithRoles } from "~/types/users-coldfusion";
import { type VSUserRoleValuesNew } from "~/types/users";
import { getOrganisationTypeByID } from "~/utils/server/database-tools";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contactId } = req.body;
    if (!contactId) {
        return res.status(400).json({ error: 'Contact ID is required' });
    }

    try {
        // If user is Fietsberaad rootman: Access to all contacts
        if(session.user.mainContactId === '1') {
          // First, check if user is rootman for contact '1'
          const user = await prisma.security_users.findFirst({
            where: { UserID: session.user.id },
            select: {
              user_contact_roles: {
                where: { ContactID: '1' },
                select: { NewRoleID: true }
              }
            }
          }) as VSUserWithRoles;

          if(user?.user_contact_roles[0]?.NewRoleID === 'rootadmin') {
            // Create new security profile with updated active contact   
            const activeContactType = await getOrganisationTypeByID(contactId);
            const securityProfile = createSecurityProfile('rootadmin' as VSUserRoleValuesNew, activeContactType);

            // Create updated user object
            const updatedUser = {
                ...session.user,
                activeContactId: contactId,
                securityProfile
            };

            return res.status(200).json({ user: updatedUser });
          }
        }

        // If not rootman of Fietsberaad, check if user has access to contact
        else {
          // Get current user data
          const user = await prisma.security_users.findFirst({
              where: { UserID: session.user.id },
              select: {
                user_contact_roles: {
                  where: { ContactID: contactId },
                  select: { NewRoleID: true }
                }
              }
          }) as VSUserWithRoles;

          if (!user) {
              console.error("User not found");
              return res.status(404).json({ error: 'User not found' });
          }

          if(!user.user_contact_roles[0]) {
              console.error("User has no roles for this contact. Unable to switch contact.");
              return res.status(403).json({ error: 'User has no roles for this contact. Unable to switch contact.' });
          }

          // Create new security profile with updated active contact
          const activeContactType = await getOrganisationTypeByID(contactId);
          const securityProfile = createSecurityProfile(user.user_contact_roles[0].NewRoleID as VSUserRoleValuesNew, activeContactType);

          // Create updated user object
          const updatedUser = {
              ...session.user,
              activeContactId: contactId,
              securityProfile
          };

          // The session will be automatically updated on the server side
          // when the client calls the update() function from useSession
          // console.log(">>> updatedUser activeContactId", updatedUser.activeContactId);
          return res.status(200).json({ user: updatedUser });
        }
    } catch (error) {
        console.error('Error switching contact:', error);
        return res.status(500).json({ error: 'Failed to switch contact' });
    }
} 