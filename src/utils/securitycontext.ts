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

export const convertNewRoleToOldRole = (newRoleID: VSUserRoleValuesNew | null, groupID?: string): VSUserRoleValues | null => {
    if (!newRoleID) {
        return null;
    }

    switch(newRoleID) {
        case VSUserRoleValuesNew.RootAdmin:
            // RootAdmin is relative to the organization:
            // - For intern users (Fietsberaad): RootAdmin = Root (RoleID 1)
            // - For extern users: RootAdmin = ExternAdmin (RoleID 4) - they're admin of their organization
            // - For exploitant users: RootAdmin = Exploitant (RoleID 6) - they're admin of their organization
            if (groupID === "extern") {
                return VSUserRoleValues.ExternAdmin;  // 4
            }
            if (groupID === "exploitant") {
                return VSUserRoleValues.Exploitant;  // 6
            }
            if (groupID === "beheerder") {
                return VSUserRoleValues.Beheerder;  // 7
            }
            // Default to Root for intern users or undefined
            return VSUserRoleValues.Root;  // 1
        case VSUserRoleValuesNew.Admin:
            // Use groupID to determine correct old role
            if (groupID === "extern") {
                return VSUserRoleValues.ExternAdmin;  // 4
            }
            if (groupID === "exploitant") {
                return VSUserRoleValues.Exploitant;  // 6
            }
            if (groupID === "beheerder") {
                return VSUserRoleValues.Beheerder;  // 7
            }
            // Default to InternAdmin for intern or undefined
            return VSUserRoleValues.InternAdmin;  // 2
        case VSUserRoleValuesNew.Editor:
            // Use groupID to determine correct old role
            if (groupID === "extern") {
                return VSUserRoleValues.ExternEditor;  // 5
            }
            if (groupID === "exploitant" || groupID === "beheerder") {
                // Exploitant (and beheerder) users must keep RoleID 6 in security_users
                // regardless of the new Editor role selection
                return VSUserRoleValues.Exploitant;  // 6
            }
            // Editor role doesn't exist for other groups, use InternEditor as fallback
            return VSUserRoleValues.InternEditor;  // 3
        case VSUserRoleValuesNew.Viewer:
            // Use groupID to determine correct old role
            if (groupID === "extern") {
                return VSUserRoleValues.ExternDataAnalyst;  // 10
            }
            if (groupID === "exploitant") {
                return VSUserRoleValues.ExploitantDataAnalyst;  // 8
            }
            // Default to InternDataAnalyst for intern, beheerder, or undefined
            return VSUserRoleValues.InternDataAnalyst;  // 9
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
    const isDataEigenaar = contactItemType === "organizations";

    const isRootAdminFietsberaad = isFietsberaad && isRootAdmin;
    const isAdminFietsberaad = isFietsberaad && isAdmin;
    const isRootAdminExploitant = isExploitant && isRootAdmin;
    const isAdminDataEigenaar = isDataEigenaar && isAdmin;

    currentTopics[VSSecurityTopic.fietsberaad_superadmin] = isRootAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.fietsberaad_admin] = isAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.exploitant_superadmin] = isRootAdminExploitant ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.acceptatie_ontwikkeling] = isAdminFietsberaad ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_dataeigenaar] = (isAdminFietsberaad || isAdminDataEigenaar) ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.gebruikers_dataeigenaar_admin] = isRootAdmin ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.gebruikers_dataeigenaar_beperkt] = isAdmin? allowCRUD : allowNone
    // Deny exploitanten_beheerrecht if current organization is an exploitant
    currentTopics[VSSecurityTopic.exploitanten_beheerrecht] = (isRootAdmin) ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_fietsenstallingen_admin] = isAdmin? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.instellingen_fietsenstallingen_beperkt] = isEditor? allowCRUD : allowNone
    if(isFietsberaad) {
        currentTopics[VSSecurityTopic.instellingen_site_content_pages] = isRootAdmin ? allowCRUD : allowNone
        // FAQ only for fietsberaad editors
        currentTopics[VSSecurityTopic.instellingen_site_content_faq] = isEditor ? allowCRUD : allowNone
    } else {
        currentTopics[VSSecurityTopic.instellingen_site_content_pages] = isEditor? allowReadUpdate : allowNone
        currentTopics[VSSecurityTopic.instellingen_site_content_faq] = allowNone
    }
    currentTopics[VSSecurityTopic.rapportages] = isViewer ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.fmsservices] = isRootAdmin ? allowCRUD : allowNone
    currentTopics[VSSecurityTopic.wachtrij] = isRootAdminFietsberaad ? allowCRUD : (isAdminFietsberaad ? allowRead : allowNone)

    return currentTopics;        
};
