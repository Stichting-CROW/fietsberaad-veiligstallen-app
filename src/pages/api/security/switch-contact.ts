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
        // If user is Fietsberaad rootadmin: Access to all contacts
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

          const userRole = user?.user_contact_roles[0]?.NewRoleID;
          if(userRole === 'rootadmin' || userRole === 'viewer') {
            // Create new security profile with updated active contact   
            const activeContactType = await getOrganisationTypeByID(contactId);
            const securityProfile = createSecurityProfile(userRole as VSUserRoleValuesNew, activeContactType);

            // Create updated user object
            const updatedUser = {
                ...session.user,
                activeContactId: contactId,
                securityProfile
            };

            return res.status(200).json({ user: updatedUser });
          }
          
          // If Fietsberaad user doesn't have rootadmin role, they can't switch contacts
          return res.status(403).json({ error: 'Fietsberaad user must have rootadmin or viewer role to switch contacts' });
        }

        // If not rootman of Fietsberaad, check if user can switch to this contact
        else {
          // Get user's parent organization (isOwnOrganization = true)
          const parentOrgRole = await prisma.user_contact_role.findFirst({
            where: {
              UserID: session.user.id,
              isOwnOrganization: true
            },
              select: {
              ContactID: true,
              NewRoleID: true
            }
          });

          if (!parentOrgRole) {
              console.error("User has no parent organization");
              return res.status(403).json({ error: 'User has no parent organization. Unable to switch contact.' });
          }

          const parentOrgID = parentOrgRole.ContactID;

          // Check if contactId is the user's own parent organization
          const isOwnParentOrg = contactId === parentOrgID;

          // Check if contactId is managed by the user's parent organization
          const managedOrg = await prisma.contact_contact.findFirst({
            where: {
              parentSiteID: parentOrgID,
              childSiteID: contactId
              }
          });

          const isManagedByParent = !!managedOrg;

          // Security check: Only allow switching to parent org or organizations managed by parent
          if (!isOwnParentOrg && !isManagedByParent) {
              console.error(`User ${session.user.id} attempted to switch to unauthorized contact ${contactId}. Parent org: ${parentOrgID}`);
              return res.status(403).json({ 
                error: 'Cannot switch to this contact. Only parent organization or organizations managed by parent organization are allowed.' 
              });
          }

          // Get the role for the contactId (either parent org role or managed org role)
          let roleForContact: VSUserRoleValuesNew;
          
          if (isOwnParentOrg) {
            // Use the parent organization role
            roleForContact = parentOrgRole.NewRoleID as VSUserRoleValuesNew;
          } else {
            // Get role for the managed organization
            const managedOrgRole = await prisma.user_contact_role.findFirst({
              where: {
                UserID: session.user.id,
                ContactID: contactId
              },
              select: { NewRoleID: true }
            });

            if (!managedOrgRole) {
                console.error(`User has no role for managed organization ${contactId}`);
                return res.status(403).json({ error: 'User has no role for this managed organization. Unable to switch contact.' });
            }

            roleForContact = managedOrgRole.NewRoleID as VSUserRoleValuesNew;
          }

          // Create new security profile with updated active contact
          const activeContactType = await getOrganisationTypeByID(contactId);
          const securityProfile = createSecurityProfile(roleForContact, activeContactType);

          // Create updated user object
          const updatedUser = {
              ...session.user,
              activeContactId: contactId,
              securityProfile
          };

          // The session will be automatically updated on the server side
          // when the client calls the update() function from useSession
          return res.status(200).json({ user: updatedUser });
        }
    } catch (error) {
        console.error('Error switching contact:', error);
        return res.status(500).json({ error: 'Failed to switch contact' });
    }
} 