/*
    support functions for login with next-auth
*/
// import type { User } from "next-auth";
import bcrypt from "bcrypt";
import { prisma } from "~/server/db";
import type { User } from "next-auth";
import { securityUserSelect, VSUserRoleValuesNew, VSUserWithRoles } from "~/types";
import { createSecurityProfile } from "~/utils/securitycontext";
import { initAllTopics } from "~/types/utils";
export const getUserFromCredentials = async (
  credentials: Record<"email" | "password", string> | undefined
): Promise<User | null> => {
  if (!credentials) return null;

  console.log("### getUserFromCredentials", credentials);

  const { email, password } = credentials;
  if (!email || !password) return null;

  let validaccount = false;
  let account: User = {
    id: "",
    email: email.toLocaleLowerCase(),
    activeContactId: "",
    securityProfile: {
      managingContactIDs: [],
      mainContactId: "",
      roleId: VSUserRoleValuesNew.None,
      rights: initAllTopics({ create: false, read: false, update: false, delete: false }),
      modules: [],
    }
  };

  // check if this is an organizational account via security_accounts table
  const orgaccount = await prisma.security_users.findFirst({ where: { UserName: email.toLowerCase() }, select: { UserID: true, EncryptedPassword: true } });
  // console.log("**** ORGACCOUNT", orgaccount);
  if (orgaccount !== undefined && orgaccount !== null && orgaccount.EncryptedPassword !== null) {
    console.log("got orgaccount", orgaccount);
    if (bcrypt.compareSync(password, orgaccount.EncryptedPassword)) {
      const userdata = await prisma.security_users.findFirst({ where: { UserName: email.toLowerCase() }, select: securityUserSelect }) as VSUserWithRoles;
      validaccount = true;
      account.id = userdata?.UserID || "";
      account.securityProfile = await createSecurityProfile(userdata);
    } else {
      console.log("### getUserFromCredentials - invalid password for security_users table");
    }
  } else {
    console.log("### getUserFromCredentials - no orgaccount");
  }

  // check if this is a normal user via accounts table
  // const useraccount = await prisma.accounts.findFirst({ where: { Email: email.toLowerCase(), account_type: 'USER' } });
  // if(useraccount!==undefined && useraccount!==null && useraccount.EncryptedPassword!==null) {
  //   if(bcrypt.compareSync(password, useraccount.EncryptedPassword)) {
  //     validaccount = true;
  //     account.OtherUserID = useraccount.ID;

  //     // console.log("### getUserFromCredentials - found account in accounts table -", account);
  //   } else {
  //     console.log("### getUserFromCredentials - invalid password for accounts table");
  //   }
  // } else {
  //   console.log("### getUserFromCredentials - no useraccount");
  // }


  return validaccount ? account : null;
};