/*
    support functions for login with next-auth
*/
// import type { User } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "~/server/db";
import type { security_users } from "~/generated/prisma-client";
import type { User } from "next-auth";
import {
  VSUserRoleValuesNew,
  getDefaultSecurityProfile,
} from "~/types/users";
import { createSecurityProfile } from "~/utils/server/securitycontext";
import { checkToken } from "~/utils/token-tools";
import { getOrganisationTypeByID } from "~/utils/server/database-tools";

type OrgAccountData = Pick<security_users, "UserID" | "DisplayName" | "UserName" | "GroupID" | "ParentID" | "SiteID" | "EncryptedPassword"> & {
  user_contact_roles: { 
    ContactID: string,
    isOwnOrganization: boolean,
    NewRoleID: string
  }[];
};

const getProfileUser = async(orgaccount: OrgAccountData): Promise<User|false> => {
    const profileUserAccount: User = {
      id: "",
      name: "",
      email: "",
      mainContactId: "",
      activeContactId: "",
      securityProfile: getDefaultSecurityProfile(),
    };

    const mainContactId = orgaccount.user_contact_roles.find((role) => role.isOwnOrganization)?.ContactID || undefined;
    if (mainContactId === undefined) {
      return false;
    }

    const roleId = orgaccount?.user_contact_roles.find((role) => role.ContactID === mainContactId)?.NewRoleID as VSUserRoleValuesNew || VSUserRoleValuesNew.None;
    const activeContactType = await getOrganisationTypeByID(mainContactId);

    profileUserAccount.id = orgaccount.UserID || "";
    profileUserAccount.name = orgaccount?.DisplayName || "";
    profileUserAccount.email = orgaccount?.UserName || "";
    profileUserAccount.mainContactId = mainContactId;
    profileUserAccount.activeContactId = mainContactId;
    profileUserAccount.securityProfile = createSecurityProfile(roleId, activeContactType);

    return profileUserAccount;
}

// always returns the user's main account
export const getUserFromCredentials = async (
  credentials: Record<"email" | "password", string> | undefined,
): Promise<User | null> => {
  try {
    if (!credentials) {
      console.error("### getUserFromCredentials - no credentials provided");
      return null;
    }

    const { email, password } = credentials;
    if (!email || !password) {
      console.error("### getUserFromCredentials - missing email or password");
      return null;
    }

    const orgaccount = await prisma.security_users.findFirst({
      where: { UserName: email.toLowerCase() },
      select: { 
        UserID: true, 
        DisplayName: true,
        UserName: true,
        EncryptedPassword: true,
        user_contact_roles: {
          select: {
            ContactID: true,
            isOwnOrganization: true
          }
        }
      },
    }) as OrgAccountData;

    if (
      orgaccount !== undefined &&
      orgaccount !== null &&
      orgaccount.EncryptedPassword !== null
    ) {
      if (await bcrypt.compare(password, orgaccount.EncryptedPassword)) {
        const profileUserAccount = await getProfileUser(orgaccount);
        if (profileUserAccount) {
          return profileUserAccount;
        } else {
          console.error("### getUserFromCredentials - no profile user account");
          return null;
        }
      } else {
        console.error(
          "### getUserFromCredentials - invalid password for security_users table",
        );
        return null;
      }
    } else {
      console.error("### getUserFromCredentials - no orgaccount");
      return null;
    }
  } catch (error) {
    console.error("Error in getUserFromCredentials:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
    return null;
  }
};

export const getUserFromLoginCode = async (
  credentials: Record<"userid" | "token", string> | undefined,
): Promise<User | null> => {
  try {
    if (!credentials) {
      console.error("### getUserFromLoginCode - no credentials provided");
      return null;
    }

    const { userid, token } = credentials;
    if (!userid || !token) {
      console.error("### getUserFromLoginCode - missing userid or token");
      return null;
    }

    const tokenData = checkToken(token);

    if (
      tokenData !== false &&
      tokenData.userid.toLowerCase() === userid.toLowerCase()
    ) {
      const orgaccount = await prisma.security_users.findFirst({
        where: { UserID: userid },
        select: { 
          UserID: true, 
          GroupID: true,
          ParentID: true,
          EncryptedPassword: true,
          user_contact_roles: {
            select: {
              ContactID: true,
              isOwnOrganization: true
            }
          }
        },
      }) as OrgAccountData;

      const profileUserAccount = await getProfileUser(orgaccount);
      if (profileUserAccount) {
        return profileUserAccount;
      } else {
        console.error("### getUserFromCredentials - no profile user account");
        return null;
      }
    } else {
      console.error("### getUserFromLoginCode - invalid login code");
      return null;
    }
  } catch (error) {
    console.error("Error in getUserFromLoginCode:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
    return null;
  }
};
