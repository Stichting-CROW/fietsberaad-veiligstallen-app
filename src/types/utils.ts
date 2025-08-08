import { VSUserRoleValuesNew } from "~/types/users";
import { VSSecurityTopic, type VSCRUDRight, type VSUserSecurityProfile } from "~/types/securityprofile";
import { type Session } from "next-auth";
import { VSUserRoleValues } from "~/types/users-coldfusion";

export const getNewRoleLabel = (roleId: VSUserRoleValuesNew): string => {
    switch(roleId) {
        case VSUserRoleValuesNew.RootAdmin:
            return "Super admin";
        case VSUserRoleValuesNew.None:
            return "Geen rechten";
        case VSUserRoleValuesNew.Admin:
            return "Admin";
        case VSUserRoleValuesNew.Editor:
            return "Editor";
        case VSUserRoleValuesNew.Viewer:
            return "Data-analist";
        default:
            return "Unknown";
    }
}

export const getOldRoleLabel = (roleId: VSUserRoleValues): string => {
    switch(roleId) {
        case VSUserRoleValues.Root:
            return "Root";
        case VSUserRoleValues.InternAdmin:
            return "Intern Admin";
        case VSUserRoleValues.InternEditor:
            return "Intern Editor";
        case VSUserRoleValues.ExternAdmin:
            return "Extern Admin";
        case VSUserRoleValues.ExternEditor:
            return "Extern Editor";
        case VSUserRoleValues.Exploitant:
            return "Exploitant";
        case VSUserRoleValues.Beheerder:
            return "Beheerder";
        case VSUserRoleValues.ExploitantDataAnalyst:
            return "Exploitant Data Analist";
        case VSUserRoleValues.InternDataAnalyst:
            return "Intern Data Analist";
        case VSUserRoleValues.ExternDataAnalyst:
            return "Extern Data Analist";
    }
}

export const initAllTopics = (value: VSCRUDRight) => {
    const allTopics = Object.values(VSSecurityTopic) as VSSecurityTopic[];
    const result = allTopics.reduce<Record<VSSecurityTopic, VSCRUDRight>>((acc, topic) => {
        acc[topic] = { ...value };
        return acc;
    }, {} as Record<VSSecurityTopic, VSCRUDRight>);

    return result;
}

export const userHasRight = (profile: VSUserSecurityProfile | undefined, right: VSSecurityTopic): boolean => {
    if(!profile) {
        console.log("### profile is undefined");
        return false;
    }

    const theRight = profile.rights[right];
    if(!theRight) {
        console.log("### theRight is not in profile", theRight);
        return false;
    }

    const hasRight = theRight.create || theRight.read || theRight.update || theRight.delete;  
    // console.log(`### hasRight ${right}: ${hasRight} | ${JSON.stringify(theRight)}`);
    return hasRight;
}

export const userHasRole = (profile: VSUserSecurityProfile | undefined, role: VSUserRoleValuesNew): boolean => {
    if(!profile) return false;

    return profile.roleId === role;
}

export const logSession = (session: Session | null) => {
    if(!session) {
        console.log("### no active session");
        return;
    }

    console.log("### session");
    console.log("expires", session.expires);
    if(!session.user) {
        console.log("### no user in session");
        return;
    }

    console.log("user", session.user.name);
    console.log("  id", session.user.id);
    console.log("  name", session.user.name);
    console.log("  email", session.user.email);
    console.log("  activeContactId", session.user.activeContactId);

    console.log("  security profile");
    logSecurityProfile(session.user.securityProfile, "    ");
}

export const logSecurityProfile = (profile: VSUserSecurityProfile | undefined, indent = '') => {
    if(!profile) {
        console.log(`${indent}no security profile`);
        return;
    }

    const activeRights = Object.entries(profile.rights)
        .filter(([_, right]) => right.create || right.read || right.update || right.delete)
        .map(([key, _]) => key);

    console.log(`${indent}roleId: ${profile.roleId}`);
    console.log(`${indent}rights: ${activeRights.join(", ")}`);
}
  

