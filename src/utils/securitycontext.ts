import { type VSCRUDRight, type VSUserSecurityProfile, VSSecurityTopic } from "~/types/securityprofile";    
import { allowNone, allowCRUD, allowRead, allowReadUpdate } from "~/utils/client/security-profile-tools";
import { VSUserRoleValuesNew } from '~/types/users';
import { VSUserRoleValues} from '~/types/users-coldfusion';

import { initAllTopics } from "~/types/utils";

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
    contactItemType: string | null,
): VSUserRoleRights => {

    const currentTopics: Record<VSSecurityTopic, VSCRUDRight> = initAllTopics(allowNone);
    if(!roleID) {
        return currentTopics;
    }

    const isRootAdmin = roleID === VSUserRoleValuesNew.RootAdmin;
    const isAdmin = roleID === VSUserRoleValuesNew.Admin || isRootAdmin;
    const isEditor = roleID === VSUserRoleValuesNew.Editor || isAdmin;
    const isViewer = roleID === VSUserRoleValuesNew.Viewer || isEditor;

    const isFietsberaad = contactItemType === "admin";
    const isExploitant = contactItemType === "exploitant";

    const isRootAdminFietsberaad = isFietsberaad && isRootAdmin;
    const isAdminFietsberaad = isFietsberaad && isAdmin;
    const isRootAdminExploitant = isExploitant && isRootAdmin;

    currentTopics[VSSecurityTopic.fietsberaad_superadmin] = isRootAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.fietsberaad_admin] = isAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.exploitant_superadmin] = isRootAdminExploitant ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.acceptatie_ontwikkeling] = isAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_dataeigenaar] = isAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.gebruikers_dataeigenaar_admin] = isRootAdmin ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.gebruikers_dataeigenaar_beperkt] = isAdmin? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.exploitanten_toegangsrecht] = isRootAdmin ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_fietsenstallingen_admin] = isAdmin? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_fietsenstallingen_beperkt] = isEditor? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_site_content] = isEditor? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.rapportages] = isViewer ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.fmsservices] = isRootAdmin ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.wachtrij] = isRootAdminFietsberaad ? allowCRUD : (isAdminFietsberaad ? allowRead : allowNone)

    return currentTopics;        
};
