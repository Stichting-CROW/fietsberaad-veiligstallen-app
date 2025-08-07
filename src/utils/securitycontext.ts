import { type VSCRUDRight, type VSUserSecurityProfile, VSSecurityTopic } from "~/types/securityprofile";    
import { allowNone, allowCRUD, allowRead, allowReadUpdate } from "~/utils/client/security-profile-tools";
import { VSUserRoleValuesNew } from '~/types/users';
import { VSUserRoleValues} from '~/types/users-coldfusion';

import { changeTopics, initAllTopics } from "~/types/utils";

// Module access definitions per contact type
// type ModuleAccess = {
//     [key in VSModuleValues]: boolean;
// };

// Role definitions with CRUD rights per topic
export type VSUserRoleRights = {
    [key in VSSecurityTopic]?: VSCRUDRight;
};

export const convertRoleToNewRole = (roleID: VSUserRoleValues | null, isOwnOrganization: boolean): VSUserRoleValuesNew => {
    let newRoleID: VSUserRoleValuesNew = VSUserRoleValuesNew.None;

    switch(roleID) {
        case VSUserRoleValues.Root:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.RootAdmin : VSUserRoleValuesNew.Admin;
            break;
        case VSUserRoleValues.Exploitant:
        case VSUserRoleValues.InternAdmin:
            newRoleID = VSUserRoleValuesNew.Admin;
            break;
        case VSUserRoleValues.InternEditor:
            newRoleID = VSUserRoleValuesNew.Editor;
            break;
        case VSUserRoleValues.ExploitantDataAnalyst:
        case VSUserRoleValues.InternDataAnalyst:
            newRoleID = VSUserRoleValuesNew.Viewer;
            break;
        case VSUserRoleValues.ExternAdmin:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.Admin : VSUserRoleValuesNew.None;
            break;
        case VSUserRoleValues.ExternEditor:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.Editor : VSUserRoleValuesNew.None;
            break;
        case VSUserRoleValues.ExternEditor:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.Editor : VSUserRoleValuesNew.None;
            break;
        case VSUserRoleValues.ExternDataAnalyst:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.Viewer : VSUserRoleValuesNew.None;
            break;
        case VSUserRoleValues.Beheerder:
            newRoleID = isOwnOrganization ? VSUserRoleValuesNew.Admin : VSUserRoleValuesNew.None;
            break;
        default:
            break;
    }

    return newRoleID;
}

export const convertNewRoleToOldRole = (newRoleID: VSUserRoleValuesNew | null): VSUserRoleValues | null => {
    if (!newRoleID) {
        return null;
    }

    switch(newRoleID) {
        case VSUserRoleValuesNew.RootAdmin:
            return VSUserRoleValues.Root;
        case VSUserRoleValuesNew.Admin:
            // Since Admin could come from multiple old roles, we'll return the most restrictive one
            // that would map back to Admin in the new system
            return VSUserRoleValues.InternAdmin;
        case VSUserRoleValuesNew.Editor:
            return VSUserRoleValues.InternEditor;
        case VSUserRoleValuesNew.Viewer:
            return VSUserRoleValues.InternDataAnalyst;
        case VSUserRoleValuesNew.None:
            return null;
        default:
            return null;
    }
}


export const getRights = (profile: VSUserSecurityProfile | null, topic: VSSecurityTopic): VSCRUDRight => {
    if (!profile) {
        return allowNone;
    }

    const baseRights = profile.rights[topic] || allowNone;
    return baseRights;
}

export const getRoleRights = (
    roleID: VSUserRoleValuesNew | null, 
): VSUserRoleRights => {
    const noRights = initAllTopics(allowNone);
    const allrights = initAllTopics(allowCRUD);

    switch(roleID) {
        case VSUserRoleValuesNew.RootAdmin:
            return allrights;
        case VSUserRoleValuesNew.Admin:
            // only root admin gets to manage system settings and users
            return changeTopics(allrights, [
                VSSecurityTopic.System,
                VSSecurityTopic.Development,
            ], allowNone);
        case VSUserRoleValuesNew.Editor:
            return changeTopics(noRights, [
                // VSSecurityTopic.ContactsGemeenten,
                // VSSecurityTopic.ContactsExploitanten,
                // VSSecurityTopic.Report,
                // VSSecurityTopic.Buurtstallingen,
                // VSSecurityTopic.Fietskluizen,
                VSSecurityTopic.Website,
            ], allowCRUD);
        case VSUserRoleValuesNew.Viewer:
            let rights = changeTopics(noRights, [
                VSSecurityTopic.ContactsGemeenten,
                VSSecurityTopic.ContactsExploitanten,
                VSSecurityTopic.Buurtstallingen,
                VSSecurityTopic.Fietskluizen,
                VSSecurityTopic.ApisGekoppeldeLocaties,
            ], allowRead);
            rights = changeTopics(rights, [
                VSSecurityTopic.Report,
            ], allowCRUD);
            return rights;
        case VSUserRoleValuesNew.None:  
            return noRights;
    }   

    return noRights;
};
