import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { prisma } from "~/server/db";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { VSUserRoleValuesNew } from "~/types/users";
import { z } from "zod";

const updateContactPersonSchema = z.object({
  contactID: z.string().nullable(),
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({ error: "Unauthorized - no session found" });
    return;
  }

  const id = req.query.id as string;
  if (!id || id === "new") {
    res.status(400).json({ error: "Invalid gemeente ID" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({ error: validateUserSessionResult.error });
    return;
  }

  // Check if user has access to this gemeente
  const hasAccess = validateUserSessionResult.sites.includes(id) || 
                   validateUserSessionResult.activeContactId === id;
  
  if (!hasAccess) {
    console.error("No access to this gemeente", id);
    res.status(403).json({ error: "No access to this gemeente" });
    return;
  }

  switch (req.method) {
    case "PUT": {
      // Only fietsberaad admins can update contact person
      if (session.user.mainContactId !== "1") {
        console.error("Unauthorized - only fietsberaad admins can update contact person");
        res.status(403).json({ error: "Alleen fietsberaad beheerders kunnen de contactpersoon wijzigen" });
        return;
      }

      try {
        const parseResult = updateContactPersonSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Invalid data format:", parseResult.error);
          res.status(400).json({ error: "Invalid data format" });
          return;
        }

        const { contactID } = parseResult.data;

        // Get the current contact person for this gemeente
        const currentContact = await prisma.security_users_sites.findFirst({
          where: {
            SiteID: id,
            IsContact: true,
          },
        });

        // If there's a current contact person, remove the IsContact flag
        if (currentContact) {
          // Use updateMany with explicit UserID and SiteID to ensure we only update the intended record
          await prisma.security_users_sites.updateMany({
            where: {
              ID: currentContact.ID,
              UserID: currentContact.UserID,
              SiteID: id, // Verify SiteID matches the gemeente we're updating
            },
            data: {
              IsContact: false,
            },
          });
        }

        // If a new contact person is specified, set the IsContact flag
        if (contactID) {
          // Ensure user_contact_role exists first (required for sync)
          const existingRole = await prisma.user_contact_role.findFirst({
            where: {
              UserID: contactID,
              ContactID: id,
            },
          });

          if (!existingRole) {
            // Create user_contact_role with viewer role if it doesn't exist
            await prisma.user_contact_role.create({
              data: {
                ID: generateID(),
                UserID: contactID,
                ContactID: id,
                NewRoleID: VSUserRoleValuesNew.Viewer,
                isOwnOrganization: false,
              },
            });
          }

          // Check if the user-site relationship already exists
          const existingRelation = await prisma.security_users_sites.findFirst({
            where: {
              UserID: contactID,
              SiteID: id,
            },
          });

          if (existingRelation) {
            // Update existing relation - use updateMany with explicit UserID and SiteID to ensure we only update the intended record
            await prisma.security_users_sites.updateMany({
              where: {
                ID: existingRelation.ID,
                UserID: contactID, // Verify UserID matches
                SiteID: id, // Verify SiteID matches the gemeente we're updating
              },
              data: {
                IsContact: true,
              },
            });
          } else {
            // Create new relation
            await prisma.security_users_sites.create({
              data: {
                UserID: contactID,
                SiteID: id,
                IsContact: true,
              },
            });
          }
        }

        res.status(200).json({ success: true });
      } catch (error) {
        console.error("Error updating contact person:", error);
        res.status(500).json({ error: "Error updating contact person" });
      }
      break;
    }
    default: {
      res.status(405).json({ error: "Method Not Allowed" });
    }
  }
}
