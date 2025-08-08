import React from "react";

import { getNewRoleLabel } from "~/types/utils";
import { VSUserWithRolesNew } from "~/types/users";
import { UserAccessRight } from "~/components/beheer/users/UserAccessRight";

interface ExploreUserSecurityProfileComponentProps {
    selectedUser: VSUserWithRolesNew;
}

export const ExploreUserSecurityProfileComponent = ({
    selectedUser
}: ExploreUserSecurityProfileComponentProps) => {
    if(!selectedUser) {
        return null;
    }

    if(!selectedUser.securityProfile) {
        return null;
    }

return (
    <div className="p-6 bg-white shadow-md rounded-md mt-2 flex flex-col mb-6">
        <div className="text-2xl font-bold mb-4">Beveiligingsprofiel</div>

                <div className="space-y-2">
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rol ID:</label>
                        <span className="text-gray-900">{getNewRoleLabel(selectedUser.securityProfile.roleId)}</span>
                    </div>
                </div>
                <div className="mt-4">
                    <UserAccessRight newRoleID={selectedUser.securityProfile.roleId} showRoleInfo={false} />
                </div>
            </div>
    );
}; 