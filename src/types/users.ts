import type { security_users, user_contact_role } from "~/generated/prisma-client";
import type { VSUserSecurityProfile } from "~/types/securityprofile";
import { initAllTopics } from "./utils";

export enum VSUserRoleValuesNew {
    RootAdmin = "rootadmin",
    Admin = 'admin',
    Editor = 'editor',
    Viewer = 'viewer',
    None = 'none',
}

export type VSUserWithRolesNew = Pick<security_users, "UserID" | "UserName" | "DisplayName" | "Status" | "LastLogin" > & {
    securityProfile: VSUserSecurityProfile;
    isContact: boolean;
    ownOrganizationID: string;
    isOwnOrganization: boolean;
}
// "EncryptedPassword" | "EncryptedPassword2"

export const getDefaultSecurityProfile = (): VSUserSecurityProfile => ({
    roleId: VSUserRoleValuesNew.None,
    rights: initAllTopics({
        create: false,
        read: false,
        update: false,
        delete: false,
      }),
})