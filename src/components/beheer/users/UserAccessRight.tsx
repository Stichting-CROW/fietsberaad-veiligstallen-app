import React, { useEffect, useState } from 'react';
import { type VSUserRoleRightsResult } from '~/pages/api/protected/security/rolerights/[newRoleID]'
import { type VSUserRoleValuesNew } from '~/types/users';
import { type VSUserRoleRights } from '~/utils/securitycontext';
import { SECURITY_TOPIC_INFO } from '~/types/securityprofile';

interface UserAccessRightProps {
  newRoleID: VSUserRoleValuesNew;
  showRoleInfo: boolean;
}

export const UserAccessRight: React.FC<UserAccessRightProps> = ({
  newRoleID,
  showRoleInfo = false,
}) => {
  const [rights, setRights] = useState<VSUserRoleRights | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showAllAccessRights, setShowAllAccessRights] = useState(false);

  useEffect(() => {
    async function loadRights() {
      setIsLoading(true);
      setProfileError(null);

      try {
        console.log("newRoleID", newRoleID);
        const url = `/api/protected/security/rolerights/${newRoleID}`;
        console.log("url", url);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
      
        if (!response.ok) {
          throw new Error('Failed to fetch security profile');
        }
      
        const data = await response.json() as VSUserRoleRightsResult;
        setRights(data.rights);
      } catch (error) {
        console.error('Error fetching security profile:', error);
        setProfileError(error instanceof Error ? error.message : 'Failed to fetch security profile');
        setRights(undefined);
      } finally {
        setIsLoading(false);
      }
    }

    loadRights();
  }, [newRoleID]);

  if (!rights) {
    return null;
  }

  const displayRights = Object.entries(rights).filter(([topic, rights]) => 
    rights.create || rights.read || rights.update || rights.delete || showAllAccessRights
  );

  const toggleShowAll = () => {
    setShowAllAccessRights(!showAllAccessRights);
  };

  return (
    <div className="bg-white shadow-md rounded-md mt-2 flex flex-col mb-6 w-full h-max-[500px] h-full">
      {isLoading && (
        <div className="text-gray-600 p-6">Beveiligingsprofiel laden...</div>
      )}

      {profileError && (
        <div className="text-red-600 p-6">Fout: {profileError}</div>
      )}

      {!isLoading && !profileError && rights && (
        <>
          <div className="flex-none p-6 pb-4 border-b">
            <div className="text-lg font-semibold flex flex-row items-center">
              Toegangsrechten
              <button 
                onClick={toggleShowAll}
                className="ml-2 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
              >
                {showAllAccessRights ? "Minder Tonen" : "Alles Tonen"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="table-fixed w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-fit">Onderdeel</th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    <div>Rechten</div>
                  </th>
                  {showRoleInfo && <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 w-auto">
                    <div>Beschrijving</div>
                  </th>}

                  {/* <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    <div>Toevoegen</div>
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    <div>Lezen</div>
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    <div>Wijzigen</div>
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    <div>Verwijderen</div>
                  </th> */}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayRights.map(([topic, rights]) => {
                  const hasRights = rights.create || rights.read || rights.update || rights.delete;
                  if (!showAllAccessRights && !hasRights) return null;

                  const topicInfo = SECURITY_TOPIC_INFO.find(t => t.topic === topic);

                  console.log("topicInfo", topicInfo);

                  return (
                    <tr key={topic} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs font-medium text-gray-900 text-left w-fit">{topicInfo?.name || ""}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs ${hasRights ? 'text-green-600' : 'text-red-600'}`}>
                          {rights.create ? '✓' : '✗'}
                        </span>
                      </td>
                      {showRoleInfo && <td className="px-4 py-2 text-xs font-medium text-gray-900 text-left w-auto">
                        <div className="flex flex-col">
                            {(topicInfo?.description || "").split(",").map((line, index) => (
                              <span key={index}>{line}</span>
                            ))}
                        </div>
                      </td>}
                      {/* <td className="px-2 py-2 text-center">
                        <span className={`text-xs ${rights.create ? 'text-green-600' : 'text-red-600'}`}>
                          {rights.create ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs ${rights.read ? 'text-green-600' : 'text-red-600'}`}>
                          {rights.read ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs ${rights.update ? 'text-green-600' : 'text-red-600'}`}>
                          {rights.update ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs ${rights.delete ? 'text-green-600' : 'text-red-600'}`}>
                          {rights.delete ? '✓' : '✗'}
                        </span>
                      </td> */}
                    </tr>
                  );
                })}
                {displayRights.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-center text-xs text-gray-500">
                      Geen toegangsrechten
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

