import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { VSUserRoleValuesNew, type VSUserWithRolesNew } from "~/types/users";
import { VSUserGroupValues, VSUserRoleValues, type VSUserWithRoles, securityUserSelect } from "~/types/users-coldfusion";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import bcrypt from "bcryptjs";
import { convertNewRoleToOldRole } from "~/utils/securitycontext";
import { type security_users } from "@prisma/client";
import { getSecurityUserNew } from "~/utils/server/security-users-tools";
import { createSecurityProfile } from "~/utils/server/securitycontext";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

const saltRounds = 13;

export type SecurityUserResponse = {
  data?: VSUserWithRolesNew;
  error?: string;
};

export const securityUserCreateSchema = z.object({
  UserID: z.string(),
  UserName: z.string().min(1),
  DisplayName: z.string().min(1),
  Status: z.string(),
  RoleID: z.nativeEnum(VSUserRoleValuesNew),
  SiteID: z.string().nullable(),
  password: z.string(),
});

export const securityUserUpdateSchema = securityUserCreateSchema.partial().required({UserID: true});

const oldSecurityUserCreateSchema = securityUserCreateSchema.omit({password: true, RoleID: true}).extend({
  RoleID: z.nativeEnum(VSUserRoleValues),
  EncryptedPassword: z.string(),
});

export const oldSecurityUserUpdateSchema = oldSecurityUserCreateSchema.partial().required({UserID: true})

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SecurityUserResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({error: "Unauthorized - no session found"});
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    res.status(401).json({error: validateUserSessionResult.error});
    return;
  }

  const id = req.query.id as string;
  const activeContactId = session.user.activeContactId;

  // Rights validation: GET is allowed for all users,
  // other methods require gebruikers_dataeigenaar_admin or gebruikers_dataeigenaar_beperkt right
  if(
    req.method !== 'GET'
    && (
      !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)
      || !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt)
    )
  ) {
    console.error("Unauthorized - no correct access rights");
    res.status(403).json({ error: "Geen toegang tot deze organisatie - geen correcte rechten" });
    return;
  }

  switch (req.method) {
    case "GET": {
      const user = await getSecurityUserNew(id, activeContactId)
      res.status(200).json({data: user || undefined});
      break;
    }
    case "POST": {
      try {

        // Rights validation: POST is only allowed for gebruikers_dataeigenaar_admin
        if(
          !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)
        ) {
          console.error("Unauthorized - no correct access rights");
          res.status(403).json({ error: "Toevoegen nieuwe gebruiker is niet toegestaan - geen correcte rechten" });
          return;
        }
        
        const parseResult = securityUserCreateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({ error: "Unexpected/missing data error:" });
          return;
        }
        const parsed = parseResult.data;

        if(parsed.SiteID===null) {
          console.error("SiteID is required");
          res.status(400).json({error: "SiteID is required"});
          return;
        }

        const newUserID = generateID();

        // Hash the password
        const hashedPassword = await bcrypt.hash(parsed.password, saltRounds);

        // determine the groupID based on the siteID
        let groupID: VSUserGroupValues | undefined = undefined;
        if(parsed.SiteID===activeContactId) {
          groupID = VSUserGroupValues.Intern;
        } else {
          const contact = await prisma.contacts.findFirst({
            where: {
              ID: parsed.SiteID,
            },
          });

          if(!contact) {
            console.error("Contact not found for siteID:", parsed.SiteID);
            res.status(400).json({error: "Contact not found for siteID"});
            return;
          }

          if(contact.ItemType === "admin") {
            groupID = VSUserGroupValues.Intern;
          } else if(contact.ItemType === "organizations") {
            groupID = VSUserGroupValues.Extern;
          } else if(contact.ItemType === "exploitant") {
            groupID = VSUserGroupValues.Exploitant;
          } else if(contact.ItemType === "dataprovider") {
            console.error("Dataproviders have no users");
            res.status(400).json({error: "Contact has unknown item type"});
            return;
          } else {
            console.error("Contact has unknown item type:", contact.ItemType);
            res.status(400).json({error: "Contact has unknown item type"});
            return;
          }
        }

        const oldRole = convertNewRoleToOldRole(parsed.RoleID);

        const data: Pick<security_users, "UserID" | "UserName" | "DisplayName" | "RoleID" | "Status" | "GroupID" | "SiteID" | "ParentID" | "LastLogin" | "EncryptedPassword">  = {
          UserID: newUserID,
          UserName: parsed.UserName,
          DisplayName: parsed.DisplayName,
          RoleID: oldRole,
          GroupID: groupID,
          Status: parsed.Status ?? "1",
          EncryptedPassword: hashedPassword,
          SiteID: parsed.SiteID,
          ParentID: null,
          LastLogin: null
        }
        
        await prisma.security_users.create({
          data,
          select: securityUserSelect
        }) as VSUserWithRoles;

        // add role to the user_contact_role table
        await prisma.user_contact_role.upsert({
          where: {
            UserID: newUserID, ContactID: activeContactId
          },
          update: { 
            NewRoleID: parsed.RoleID,
          },
          create: {
            ID: generateID(),
            UserID: newUserID, 
            ContactID: activeContactId,
            NewRoleID: parsed.RoleID,
            isOwnOrganization: true,
          },
        });

        // add security_users_sites record for external users
        if (parsed.SiteID && groupID === VSUserGroupValues.Extern) {
          await prisma.security_users_sites.create({
            data: {
              UserID: newUserID,
              SiteID: parsed.SiteID,
              IsContact: false,
            },
          });
        }

        // get all related sites for the user
        const relatedSites = await prisma.contact_contact.findMany({
          where: {
            parentSiteID: parsed.SiteID,
          },
        });

        relatedSites.forEach(async (site) => {
          await prisma.security_users_sites.create({
            data: {
              UserID: newUserID,
              SiteID: site.childSiteID,
              IsContact: false,
            },
          });

          await prisma.user_contact_role.upsert({
            where: {
              UserID: newUserID, ContactID: site.childSiteID
            },  
            update: {
              NewRoleID: parsed.RoleID,
            },
            create: {
              ID: generateID(),
              UserID: newUserID, 
              ContactID: site.childSiteID,
              NewRoleID: VSUserRoleValuesNew.None,
              isOwnOrganization: false,
            },
          });
        });

        // fetch the new user with the full info
        const createdUser = await prisma.security_users.findFirst({
          where: {
            UserID: newUserID,
          },
          select: securityUserSelect
        }) as VSUserWithRoles;

        if(!createdUser) {
          console.error("Error creating security user: no user data found");
          res.status(500).json({error: "Error creating security user: no user data found"});
          return;
        }

        const theRoleInfo = createdUser.user_contact_roles.find((role) => role.ContactID === activeContactId);
        const ownRoleInfo = createdUser.user_contact_roles.find((role) => role.isOwnOrganization);
        if(!ownRoleInfo || !theRoleInfo?.ContactID) {
          console.error("Error creating security user: no own organization ID found");
          res.status(500).json({error: "Error creating security user: no own organization ID found"});
          return;
        }

        const newUserData: VSUserWithRolesNew = {
          UserID: createdUser.UserID, 
          UserName: createdUser.UserName, 
          DisplayName: createdUser.DisplayName, 
          Status: createdUser.Status, 
          LastLogin: createdUser.LastLogin, 
          securityProfile: createSecurityProfile(theRoleInfo?.NewRoleID as VSUserRoleValuesNew || VSUserRoleValuesNew.None),
          isContact: createdUser.security_users_sites.find((site) => site.SiteID === activeContactId)?.IsContact || false,
          ownOrganizationID: ownRoleInfo?.ContactID || "",
          isOwnOrganization: theRoleInfo?.isOwnOrganization || false,
        }        

        res.status(201).json({ data: newUserData || undefined });
      } catch (e) {
        console.error("Error creating security user:", e);
        res.status(500).json({error: "Error creating security user"});
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = securityUserUpdateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({error: "Unexpected/missing data error:"});
          return;
        }

        const parsed = parseResult.data ;

        const updateData: z.infer<typeof oldSecurityUserUpdateSchema>  = {
          UserID: parsed.UserID,
          UserName: parsed.UserName || undefined,
          DisplayName: parsed.DisplayName || undefined,
          Status: parsed.Status || undefined,
        }

        if(parsed.password) {
          updateData.EncryptedPassword = await bcrypt.hash(parsed.password, saltRounds);
        }

        // Rights validation: Updating role is only allowed for gebruikers_dataeigenaar_admin
        if(parsed.RoleID && userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)) {
          await prisma.user_contact_role.upsert({
            where: { UserID: id, ContactID: activeContactId },
            update: { 
              NewRoleID: parsed.RoleID,
            },
            create: { 
              UserID: id, 
              ContactID: activeContactId,
              NewRoleID: parsed.RoleID,
            },
          });

          updateData.RoleID = convertNewRoleToOldRole(parsed.RoleID) || undefined;
        }

        // If RoleID was set but user cannot update role, remove it
        if(parsed.RoleID && !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)) {
          updateData.RoleID = undefined;
        }

        const updatedUser = await prisma.security_users.update({
          where: { UserID: id },
          data: updateData,
          select: securityUserSelect
        }) as VSUserWithRoles;
        // const newUser = await convertToNewUser(updatedUser, activeContactId);

        const theRoleInfo = updatedUser.user_contact_roles.find((role) => role.ContactID === activeContactId)
        const ownRoleInfo = updatedUser.user_contact_roles.find((role) => role.isOwnOrganization)

        const newUserData: VSUserWithRolesNew = {
          UserID: updatedUser.UserID, 
          UserName: updatedUser.UserName, 
          DisplayName: updatedUser.DisplayName, 
          Status: updatedUser.Status, 
          LastLogin: updatedUser.LastLogin, 
          securityProfile: createSecurityProfile(theRoleInfo?.NewRoleID as VSUserRoleValuesNew || VSUserRoleValuesNew.None),
          isContact: updatedUser.security_users_sites.find((site) => site.SiteID === activeContactId)?.IsContact || false,
          ownOrganizationID: ownRoleInfo?.ContactID || "",
          isOwnOrganization: ownRoleInfo?.isOwnOrganization || false,
        }        

        res.status(200).json({data: newUserData || undefined});
      } catch (e) {
        console.error("Error updating security user:", e);
        res.status(500).json({error: "Error updating security user"});
      }
      break;
    }
    case "DELETE": {
      try {

        // Rights validation: DELETE is only allowed for gebruikers_dataeigenaar_admin
        if(
          !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin)
        ) {
          console.error("Unauthorized - no correct access rights");
          res.status(403).json({ error: "Verwijderen gebruiker is niet toegestaan - geen correcte rechten" });
          return;
        }

        // delete all user_contact_role records for the user
        await prisma.user_contact_role.deleteMany({
          where: { UserID: id }
        });

        // delete all security_users_sites records for the user
        await prisma.security_users_sites.deleteMany({
          where: { UserID: id }
        });

        // delete the user
        await prisma.security_users.delete({
          where: { UserID: id }
        });

        res.status(200).json({});
      } catch (e) {
        console.error("Error deleting security user:", e);
        res.status(500).json({error: "Error deleting security user"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
} 