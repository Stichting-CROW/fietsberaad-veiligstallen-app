import React, { useEffect, useState } from "react";

import { getNewRoleLabel } from "~/types/utils";
import { VSUserWithRolesNew } from "~/types/users";

interface ExploreUserSecurityProfileComponentProps {
    selectedUser: VSUserWithRolesNew;
}

export const ExploreUserSecurityProfileComponent = ({
    selectedUser
}: ExploreUserSecurityProfileComponentProps) => {
    const [showAllAccessRights, setShowAllAccessRights] = useState(false);

    if(!selectedUser) {
        return null;
    }

    if(!selectedUser.securityProfile) {
        return null;
    }

const displayRights = Object.entries(selectedUser.securityProfile.rights).filter(([topic, rights]) => rights.create || rights.read || rights.update || rights.delete || showAllAccessRights);

const toggleShowAll = () => {
    setShowAllAccessRights(!showAllAccessRights);
};

return (
    <div className="p-6 bg-white shadow-md rounded-md mt-2 flex flex-col mb-6">
        <div className="text-2xl font-bold mb-4">Beveiligingsprofiel</div>

                <div className="space-y-2">
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rol ID:</label>
                        <span className="text-gray-900">{getNewRoleLabel(selectedUser.securityProfile.roleId)}</span>
                    </div>
                </div>

                <div className="text-lg font-semibold mb-6 flex flex-row items-center">
                    Toegangsrechten
                    <button 
                        onClick={toggleShowAll}
                        className="ml-2 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                    >
                        {showAllAccessRights ? "Show Less" : "Show All"}
                    </button>
                </div>
                <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-2">
                    {/* Headers */}
                    <div className="font-medium text-sm">Topics</div>
                    <div className="font-medium text-sm px-2">Create</div>
                    <div className="font-medium text-sm px-2">Read</div>
                    <div className="font-medium text-sm px-2">Update</div>
                    <div className="font-medium text-sm px-2">Delete</div>

                    {displayRights.map(([topic, rights]) => {
                        const hasRights = rights.create || rights.read || rights.update || rights.delete;
                        if (!showAllAccessRights && !hasRights) return null;

                        return (
                            <>
                                <h4 className="font-medium truncate border-b pb-2">{topic}</h4>
                                <div className={`${rights.create ? 'text-green-600' : 'text-red-600'} px-2 border-b pb-2`}>
                                    {rights.create ? '✓' : '✗'}
                                </div>
                                <div className={`${rights.read ? 'text-green-600' : 'text-red-600'} px-2 border-b pb-2`}>
                                    {rights.read ? '✓' : '✗'}
                                </div>
                                <div className={`${rights.update ? 'text-green-600' : 'text-red-600'} px-2 border-b pb-2`}>
                                    {rights.update ? '✓' : '✗'}
                                </div>
                                <div className={`${rights.delete ? 'text-green-600' : 'text-red-600'} px-2 border-b pb-2`}>
                                    {rights.delete ? '✓' : '✗'}
                                </div>
                            </>
                        );
                    })}
                    {displayRights.length === 0 && (
                        <div className="col-span-5 text-gray-600">Geen toegangsrechten</div>
                    )}
                </div>
            </div>
    );
}; 