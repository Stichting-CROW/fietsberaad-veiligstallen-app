import React, { useState, useEffect } from 'react';
import { type UserStatusStatus, type UserStatusParams, type UserStatusActions, type UserStatusResult } from "~/backend/services/database-service";

const UserStatusTableComponent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);

  const [userStatusStatus, setUserStatusStatus] = useState<UserStatusStatus | undefined>(undefined);
  const [updateCounter, setUpdateCounter] = useState<number>(0);

  const cacheEndpoint = '/api/protected/database/userstatus';

  useEffect(() => {
    const fetchTableStatus = async () => {
      setLoading(true);
      try {
        const response = await fetch(cacheEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            databaseParams: {
              action: 'status'
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }

        const json = await response.json();
        setUserStatusStatus(json.status);
        setErrorState("");
      } catch (error) {
        console.error(error);
        setErrorState("Cache action failed");
      } finally {
        setLoading(false);
      }
    };

    fetchTableStatus();
  }, [updateCounter]);

  const handleProcessTable = (action: UserStatusActions) => {
    const processTable = async () => {
      console.log(">>>>> process user status table", action);
      const databaseParams: UserStatusParams = { action };

      setLoading(true);
      try {
        const response = await fetch(`${cacheEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            databaseParams
          })
        });

        if (!response.ok) {
          console.error("Cache action response - error", response);
          throw new Error(`Error: ${response}`);
        }

        const result = await response.json() as UserStatusResult;
        if (result.success && result.status) {
          setUserStatusStatus(result.status);
          setErrorState("");
        } else {
          setErrorState("User status table action failed");
          setUpdateCounter(updateCounter + 1);
        }
      } catch (error) {
        console.error(error);
        setErrorState("User status table action failed");
        setUpdateCounter(updateCounter + 1);
      } finally {
        setLoading(false);
      }
    };

    if(action === 'clear' || 
      action === 'droptable' || 
      action === 'update') {
     if(prompt("Let op! Dit maakt alle handmatige wijzigingen in de Gebruiker Status tabel ongedaan. Weet je zeker dat je dit wilt doen?\n\nType 'wissen' om door te gaan.") !== 'wissen') {
       return;
     }
   }

    processTable();
  };

  const renderActions = () => {
    return (
      <div className="flex flex-row space-x-2">
        {userStatusStatus?.status === 'available' ? (
          <>
            <button
              onClick={() => handleProcessTable('update')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Tabel Vullen
            </button>
            <button
              onClick={() => handleProcessTable('clear')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Tabel Leegmaken
            </button>
            <button
              onClick={() => handleProcessTable('droptable')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Verwijder Tabel
            </button>
          </>
        ) : (
          <button
            onClick={() => handleProcessTable('createtable')}
            className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
          >
            Genereer Tabel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-2 pl-4 rounded mb-2">
      <h2 className="text-xl font-semibold">Gebruiker Status Tabel</h2>
      <div className="mt-4">
        {userStatusStatus && userStatusStatus?.status === 'available' && (
          <table className="table-auto">
            <tbody>
              <tr>
                <td className="font-semibold">Aantal records:</td>
                {userStatusStatus.size && <td className="pl-2">{userStatusStatus.size}</td>}
              </tr>
            </tbody>
          </table>
        )}
        {userStatusStatus && userStatusStatus?.status === 'missing' && (
          <div>Gebruiker Status Tabel niet beschikbaar</div>
        )}
        {userStatusStatus && userStatusStatus?.status === 'error' && (
          <div>Gebruiker Status Tabel fout</div>
        )}
      </div>
      <div className="mt-4">
        {/* Display error and warning messages */}
        {errorState && <div style={{ color: "red", fontWeight: "bold" }}>{errorState}</div>}
        {warningState && <div style={{ color: "orange", fontWeight: "bold" }}>{warningState}</div>}
        {loading && (
          <div className="spinner" style={{ margin: "auto" }}>
            <div className="loader"></div>
          </div>
        )}
        {!loading && renderActions()}
      </div>
    </div>
  );
};

export default UserStatusTableComponent; 