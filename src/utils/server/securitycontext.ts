import { type VSUserSecurityProfile } from "~/types/securityprofile";    
import { type VSUserRoleValuesNew } from '~/types/users';

import { getRoleRights } from "~/utils/securitycontext";

export const createSecurityProfile = (roleId: VSUserRoleValuesNew): VSUserSecurityProfile => {
    try {
        const profile: VSUserSecurityProfile = {
            roleId,
            rights: getRoleRights(roleId),
        };

        return profile;
    } catch (error) {
        console.error("Error creating security profile:", error);
        throw error;
    }
}