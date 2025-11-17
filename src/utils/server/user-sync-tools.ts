import { prisma } from "~/server/db";

/**
 * Synchronizes security_users_sites records based on user_contact_role records.
 * This ensures that for every user_contact_role record, there is a corresponding
 * security_users_sites record (required for ColdFusion login).
 * 
 * @param userID - The UserID to sync records for
 * @returns Promise<boolean> - Returns true if sync was successful
 */
export async function syncSecurityUsersSitesFromUserContactRole(userID: string): Promise<boolean> {
  try {
    // Get all user_contact_role records for this user
    const userContactRoles = await prisma.user_contact_role.findMany({
      where: { UserID: userID },
      select: {
        ContactID: true,
      },
    });

    // Get all existing security_users_sites records for this user
    const existingSites = await prisma.security_users_sites.findMany({
      where: { UserID: userID },
      select: {
        ID: true,
        SiteID: true,
        IsContact: true,
      },
    });

    const contactIDs = new Set(userContactRoles.map(role => role.ContactID));
    const existingSiteIDs = new Set(existingSites.map(site => site.SiteID));

    // Create security_users_sites records for user_contact_role records that don't have them
    for (const role of userContactRoles) {
      if (!existingSiteIDs.has(role.ContactID)) {
        await prisma.security_users_sites.create({
          data: {
            UserID: userID,
            SiteID: role.ContactID,
            IsContact: false, // Default to false, can be updated separately
          },
        });
      }
    }

    // Delete security_users_sites records that don't have corresponding user_contact_role records
    // But preserve IsContact flag - if a record has IsContact=true, we should keep it
    // even if there's no user_contact_role (contact persons might not have roles)
    for (const site of existingSites) {
      if (!contactIDs.has(site.SiteID) && !site.IsContact) {
        // Only delete if it's not a contact person record
        await prisma.security_users_sites.delete({
          where: {
            ID: site.ID,
          },
        });
      }
    }

    return true;
  } catch (error) {
    console.error(`Error syncing security_users_sites for user ${userID}:`, error);
    return false;
  }
}

/**
 * Creates a security_users_sites record if it doesn't exist.
 * Updates IsContact flag if the record already exists.
 * 
 * @param userID - The UserID
 * @param siteID - The SiteID (should match ContactID in user_contact_role)
 * @param isContact - Optional IsContact flag
 * @returns Promise<boolean> - Returns true if operation was successful
 */
export async function createSecurityUsersSiteRecord(
  userID: string,
  siteID: string,
  isContact?: boolean
): Promise<boolean> {
  try {
    const existing = await prisma.security_users_sites.findFirst({
      where: {
        UserID: userID,
        SiteID: siteID,
      },
    });

    if (existing) {
      // Update IsContact if provided
      if (isContact !== undefined && existing.IsContact !== isContact) {
        await prisma.security_users_sites.update({
          where: { ID: existing.ID },
          data: { IsContact: isContact },
        });
      }
    } else {
      // Create new record
      await prisma.security_users_sites.create({
        data: {
          UserID: userID,
          SiteID: siteID,
          IsContact: isContact ?? false,
        },
      });
    }

    return true;
  } catch (error) {
    console.error(`Error creating/updating security_users_sites record for user ${userID}, site ${siteID}:`, error);
    return false;
  }
}

/**
 * Deletes a specific security_users_sites record.
 * 
 * @param userID - The UserID
 * @param siteID - The SiteID
 * @returns Promise<boolean> - Returns true if operation was successful
 */
export async function deleteSecurityUsersSiteRecord(
  userID: string,
  siteID: string
): Promise<boolean> {
  try {
    await prisma.security_users_sites.deleteMany({
      where: {
        UserID: userID,
        SiteID: siteID,
      },
    });

    return true;
  } catch (error) {
    console.error(`Error deleting security_users_sites record for user ${userID}, site ${siteID}:`, error);
    return false;
  }
}

