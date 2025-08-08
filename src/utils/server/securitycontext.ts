import { type VSUserSecurityProfile } from "~/types/securityprofile";    
import { type VSUserRoleValuesNew } from '~/types/users';

import { getRoleRights } from "~/utils/securitycontext";

export const createSecurityProfile = (roleId: VSUserRoleValuesNew, contactItemType: string | null): VSUserSecurityProfile => {
    try {
        const profile: VSUserSecurityProfile = {
            roleId,
            rights: getRoleRights(roleId, contactItemType),
        };

        return profile;
    } catch (error) {
        console.error("Error creating security profile:", error);
        throw error;
    }
}