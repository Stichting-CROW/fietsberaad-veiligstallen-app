import type { security_users, security_users_sites, security_roles, user_contact_role } from "~/generated/prisma-client";
import type { VSUserSecurityProfile } from "~/types/securityprofile";

export enum VSUserGroupValues {
    Intern = "intern",
    Extern = "extern",
    Exploitant = "exploitant",
    Beheerder = "beheerder",
}

export type VSUserRole = Pick<security_roles, "RoleID" | "Role" | "GroupID" | "Description">;

export enum VSUserRoleValues {
    Root = 1,
    InternAdmin = 2,
    InternEditor = 3,
    ExternAdmin = 4,
    ExternEditor = 5,
    Exploitant = 6,
    Beheerder = 7,
    ExploitantDataAnalyst = 8,
    InternDataAnalyst = 9,
    ExternDataAnalyst = 10
}

export type VSUserWithRoles = Pick<security_users, "UserID" | "UserName" | "DisplayName" | "RoleID" | "Status" | "GroupID" | "SiteID" | "ParentID" | "LastLogin"> & 
    {
        security_roles: VSUserRole | null;
        security_users_sites: Pick<security_users_sites, "UserID" | "SiteID" | "IsContact">[]
        user_contact_roles: Pick<user_contact_role, "UserID" | "ContactID" | "NewRoleID" | "isOwnOrganization">[]
    }

export const securityUserSelect = {
    UserID: true,
    UserName: true,
    DisplayName: true,
    RoleID: true,
    Status: true,
    GroupID: true,
    SiteID: true,
    ParentID: true,
    LastLogin: true,
    security_roles: {
        select: {
            RoleID: true,
            Role: true,
            Description: true,
            GroupID: true
        }
    },
    security_users_sites: {
        select: {
            UserID: true,
            SiteID: true,
            IsContact: true
        }
    },
    user_contact_roles: {
        select: {
            UserID: true,
            ContactID: true,
            NewRoleID: true,
            isOwnOrganization: true
        }
    }
}