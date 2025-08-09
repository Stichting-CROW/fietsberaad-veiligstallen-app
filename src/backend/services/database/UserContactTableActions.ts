import { prisma } from "~/server/db";
import { type UserContactRoleParams, type UserContactRoleStatus } from "~/backend/services/database-service";
import { convertRoleToNewRole } from "~/utils/securitycontext";
import { generateID } from "~/utils/server/database-tools";
import { VSUserGroupValues } from "~/types/users-coldfusion";
import { VSUserRoleValuesNew } from "~/types/users";
import { VSContactItemType } from "~/types/contacts";

export const getUserContactRoleTableStatus = async (_params: UserContactRoleParams) => {
  const sqldetecttable = `SELECT COUNT(*) As count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name= 'user_contact_role'`;

  let tableExists = false;
  const status: UserContactRoleStatus | false = {
    status: 'missing',
    size: undefined,
  };

  try {
    const result = await prisma.$queryRawUnsafe<{ count: number }[]>(sqldetecttable);
    tableExists = result && result.length > 0 && result[0] ? result[0].count > 0 : false;
    if (tableExists) {
      status.status = 'available';

      const sqlGetStatistics = `SELECT COUNT(*) As count FROM user_contact_role`;
      const resultStatistics = await prisma.$queryRawUnsafe<{ count: number, firstUpdate: Date, lastupdate: Date }[]>(sqlGetStatistics);
      if (resultStatistics && resultStatistics.length > 0 && resultStatistics[0] !== undefined) {
        status.size = parseInt(resultStatistics[0].count.toString());
      }
    }
    return status;
  } catch (error) {
    console.error(">>> userContactTable ERROR Unable to get user-contacts table status", error);
    return false;
  }
}

const userSelect = {
  UserID: true,
  DisplayName: true,
  GroupID: true,
  SiteID: true,
  RoleID: true,
  ParentID: true,
  security_users_sites: true,
  user_contact_roles: {
    select: {
      ID: true,
      ContactID: true,
      NewRoleID: true
    }
  }
}

const processInternUsers = async () => {
  // interne gebruikers: koppel aan fietsberaad met rol admin of none
  const allUsers = await prisma.security_users.findMany({
    select: userSelect,
    where: {GroupID: {in: [VSUserGroupValues.Intern]}}});
  for(const user of allUsers) {
    const newRoleID = convertRoleToNewRole(user.RoleID, true);

    console.debug("*** INTERN USER", user.DisplayName, "oldrole", user.RoleID, "-> newrole", newRoleID.valueOf());

    await prisma.user_contact_role.create({
      data: {
        ID: generateID(),
        UserID: user.UserID,
        ContactID: "1",
        NewRoleID: newRoleID.valueOf(),
        isOwnOrganization: true,
      } 
    });

    if(newRoleID === VSUserRoleValuesNew.RootAdmin) {
      const allRelevantContacts = await prisma.contacts.findMany({
        where: {
          ID: { not: "1"},
          ItemType: {in: [VSContactItemType.Organizations, VSContactItemType.Exploitant]},
        },
        select: {
          ID: true,
        },
      });

      for(const contact of allRelevantContacts) {
        await prisma.user_contact_role.create({
          data: {
            ID: generateID(),
            UserID: user.UserID,
            ContactID: contact.ID,
            NewRoleID: newRoleID.valueOf(),
            isOwnOrganization: false,
          } 
        });
      }
    }
  }

  return true;
}

const processExternUsers = async () => {
  // externe gebruikers: koppel aan eigen organisatie met vertaalde rol
  const allUsers = await prisma.security_users.findMany({
    select: userSelect,
    where: {GroupID: {in: [VSUserGroupValues.Extern]}},});
  for(const user of allUsers) {
    const relatedSites = user.security_users_sites;
    if(relatedSites.length !== 1||!relatedSites[0]?.SiteID) {
      console.error(`**** processExternUsers ERROR User ${user.DisplayName||'???'} has ${relatedSites.length} sites, expected 1`);
      continue;
    } else {
      const newRoleID = convertRoleToNewRole(user.RoleID, true);

      // console.debug("*** EXTERN USER - OWN ORGANIZATION", user.DisplayName, "oldrole", user.RoleID, "-> newrole", newRoleID.valueOf());

      await prisma.user_contact_role.create({
        data: {
          ID: generateID(),
          UserID: user.UserID,
          ContactID: relatedSites[0].SiteID,
          NewRoleID: newRoleID.valueOf(),
          isOwnOrganization: true,
        } 
      });
    }
  }
}

const processExploitantUsers = async () => {
  // exploitant gebruikers: koppel aan eigen organisatie met rol admin of none
  const allUsers = await prisma.security_users.findMany({select: userSelect,where: {GroupID: {in: [VSUserGroupValues.Exploitant, VSUserGroupValues.Beheerder]}}});

  for(const user of allUsers) {
    let mainContactId: string | undefined = undefined;
    let isSubUser = false;
    if(user.ParentID) {
      const parentUser = await prisma.security_users.findUnique({
        where: {
          UserID: user.ParentID,
        },
      });
      mainContactId = parentUser?.SiteID || undefined;
      isSubUser = true;
    } else {
      mainContactId = user?.SiteID || undefined;
      isSubUser = false;
    }

    // First add a role for the user in their own organization
    const mainSite = await prisma.contacts.findFirst({
      where: {
        ID: mainContactId,
      },
    });

    if(mainContactId) {
      const newRoleID = convertRoleToNewRole(user.RoleID, true);

      console.debug(`*** EXPLOITANT ${isSubUser ? "SUB" : "MAIN"} USER ${ user.DisplayName||'???'} [${mainSite?.CompanyName||'???'}] - OWN ORGANIZATION - oldrole ${user.RoleID||'???'} -> newrole ${newRoleID.valueOf()}`);

      await prisma.user_contact_role.create({
        data: {
          ID: generateID(),
          UserID: user.UserID,
          ContactID: mainContactId,
          NewRoleID: newRoleID.valueOf(),
          isOwnOrganization: true,
        } 
      });
    } else {
      console.error(`**** updateUserContactRoleTable ERROR No main contact ID found for user ${user.UserID}`);
      continue;
    }

    // Find all sites that the user is related to
    const linkedsiteIDs = await prisma.security_users_sites.findMany({
      where: {
        UserID: user.UserID,
      },
    });
    const linkedSites = await prisma.contacts.findMany({
      where: {
        ID: {in: linkedsiteIDs.map(site => site.SiteID)},
      },
    });

    for(const site of linkedSites) {
      const parentrelationtype = await prisma.contact_contact.findFirst({
        select: {
          parentSiteID: true,
          childSiteID: true,
          admin: true,
        },
        where: {
          parentSiteID: mainContactId,
          childSiteID: site.ID,
        },
      });
      let newRoleID: VSUserRoleValuesNew | null = null;
      if(parentrelationtype) {
        if(parentrelationtype.admin) {
          newRoleID = VSUserRoleValuesNew.Admin;
        } else {
          newRoleID = VSUserRoleValuesNew.Viewer;
        }

        console.debug(`*** EXPLOITANT ${isSubUser ? "SUB" : "MAIN"} USER ${ user.DisplayName||'???'} [${mainSite?.CompanyName||'???'}] - IS LINKED TO ${site.CompanyName||'???'} - oldrole ${user.RoleID||'???'} -> newrole ${newRoleID?.valueOf()}`);

        await prisma.user_contact_role.create({
          data: {
            ID: generateID(),
            UserID: user.UserID,
            ContactID: site.ID,
            NewRoleID: newRoleID.valueOf(),
            isOwnOrganization: false,
          } 
        });
      } else {
        console.debug(`*** EXPLOITANT ${isSubUser ? "SUB" : "MAIN"} USER ${ user.DisplayName||'???'} [${mainSite?.CompanyName||'???'}] - NOT LINKED TO ${site.CompanyName||'???'} - no parent relation found`);

        newRoleID = VSUserRoleValuesNew.None;
        // Not added to the table, because the user is not an admin or viewer of the site
      }
    }
  }
}

export const updateUserContactRoleTable = async (params: UserContactRoleParams): Promise<UserContactRoleStatus | false> => {
  if (false === await clearUserContactRoleTable(params)) {
    console.error(">>> updateUserContactRoleTable ERROR Unable to clear user-contacts table");
    return false;
  }

  await processInternUsers();
  await processExternUsers();
  await processExploitantUsers();

  const status = await getUserContactRoleTableStatus(params);
  console.log("*** updateUserContactRoleTable STATUS", status);
  return status;
}

export const clearUserContactRoleTable = async (params: UserContactRoleParams) => {
  // console.log(params);
  const sql = `DELETE FROM user_contact_role;`;
  await prisma.$executeRawUnsafe(sql);

  return getUserContactRoleTableStatus(params);
}

export const createUserContactRoleTable = async (params: UserContactRoleParams) => {
  const sqlCreateTable = `CREATE TABLE IF NOT EXISTS user_contact_role (
    ID VARCHAR(35) NOT NULL,
    UserID VARCHAR(36) NOT NULL,
    ContactID VARCHAR(36) NOT NULL,
    NewRoleID VARCHAR(16) DEFAULT 'none',
    isOwnOrganization BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (ID),
    UNIQUE KEY UserIDContactID (UserID, ContactID ),
    CHECK(NewRoleID IN ('rootadmin', 'admin', 'editor', 'viewer', 'none'))
  );`;

  const result = await prisma.$queryRawUnsafe(sqlCreateTable);
  if (!result) {
    console.error("Unable to create user_contact_role table", result);
    return false;
  }

  return getUserContactRoleTableStatus(params);
}

export const dropUserContactRoleTable = async (params: UserContactRoleParams ) => {
  const sql = "DROP TABLE IF EXISTS user_contact_role";

  const result = await prisma.$queryRawUnsafe(sql);
  if (!result) {
    console.error("Unable to drop user_contact_role table", result);
    return false;
  }

  return getUserContactRoleTableStatus(params);
}

export const checkUserContactRoleTable = async (params: UserContactRoleParams) => {
  // delete all records that do not have a matching user
  const sqlBase = `SELECT ucr.ID, c.ID as ContactID, su.UserID FROM user_contact_role ucr LEFT JOIN security_users su ON (su.UserID=ucr.UserID) LEFT JOIN contacts c ON (c.ID=ucr.ContactID)`

  const badRecordsUsers = await prisma.$queryRawUnsafe<{ ID: string, ContactID: string, UserID: string }[]>(sqlBase + ` WHERE isnull(su.UserID)`);
  const badRecordsContacts = await prisma.$queryRawUnsafe<{ ID: string, ContactID: string, UserID: string }[]>(sqlBase + ` WHERE isnull(c.ID)`);
  

  console.log("*** checkUserContactRoleTable BAD RECORDS (users)", badRecordsUsers.length);
  console.log("*** checkUserContactRoleTable BAD RECORDS (contacts)", badRecordsContacts.length);

  const status = await getUserContactRoleTableStatus(params);
  if(status) {
    return status;
  }

  return false;
}