import React, { useState, useEffect } from 'react';
import { type HelpdeskHandmatigIngesteldStatus, type HelpdeskHandmatigIngesteldParams, type HelpdeskHandmatigIngesteldActions, type HelpdeskHandmatigIngesteldResult } from "~/backend/services/database-service";

const HelpdeskHandmatigIngesteldTableComponent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);

  const [helpdeskHandmatigIngesteldStatus, setHelpdeskHandmatigIngesteldStatus] = useState<HelpdeskHandmatigIngesteldStatus | undefined>(undefined);
  const [updateCounter, setUpdateCounter] = useState<number>(0);

  const cacheEndpoint = '/api/protected/database/helpdeskhandmatigingesteld';

  useEffect(() => {
    const fetchFieldStatus = async () => {
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
        setHelpdeskHandmatigIngesteldStatus(json.status);
        setErrorState("");
      } catch (error) {
        console.error(error);
        setErrorState("Field status check failed");
      } finally {
        setLoading(false);
      }
    };

    fetchFieldStatus();
  }, [updateCounter]);

  const handleProcessField = (action: HelpdeskHandmatigIngesteldActions) => {
    const processField = async () => {
      console.log(">>>>> process helpdesk handmatig ingesteld field", action);
      const databaseParams: HelpdeskHandmatigIngesteldParams = { action };

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
          console.error("Field action response - error", response);
          throw new Error(`Error: ${response}`);
        }

        const result = await response.json() as HelpdeskHandmatigIngesteldResult;
        if (result.success && result.status) {
          setHelpdeskHandmatigIngesteldStatus(result.status);
          setErrorState("");
        } else {
          setErrorState("Helpdesk handmatig ingesteld field action failed");
          setUpdateCounter(updateCounter + 1);
        }
      } catch (error) {
        console.error(error);
        setErrorState("Helpdesk handmatig ingesteld field action failed");
        setUpdateCounter(updateCounter + 1);
      } finally {
        setLoading(false);
      }
    };

    if(action === 'droptable') {
     if(prompt("Let op! Dit verwijdert het HelpdeskHandmatigIngesteld veld uit de fietsenstallingen tabel. Weet je zeker dat je dit wilt doen?\n\nType 'wissen' om door te gaan.") !== 'wissen') {
       return;
     }
   }

    processField();
  };

  const renderActions = () => {
    return (
      <div className="flex flex-row space-x-2">
        {helpdeskHandmatigIngesteldStatus?.status === 'available' ? (
          <>
            <button
              onClick={() => handleProcessField('update')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Veld Vullen
            </button>
            <button
              onClick={() => handleProcessField('droptable')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Verwijder Veld
            </button>
            <button
              onClick={() => window.open('/test/helpdesk', '_blank')}
              className={`p-2 rounded-md bg-green-500 hover:bg-green-700 text-white w-64`}
            >
              Rapport
            </button>
          </>
        ) : (
          <button
            onClick={() => handleProcessField('createtable')}
            className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
          >
            Genereer Veld
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-2 pl-4 rounded mb-2">
      <h2 className="text-xl font-semibold">Helpdesk Handmatig Ingesteld Veld</h2>
      <div className="mt-4">
        {helpdeskHandmatigIngesteldStatus && helpdeskHandmatigIngesteldStatus?.status === 'available' && (
          <table className="table-auto">
            <tbody>
              <tr>
                <td className="font-semibold">Aantal records met waarde:</td>
                {helpdeskHandmatigIngesteldStatus.size !== undefined && <td className="pl-2">{helpdeskHandmatigIngesteldStatus.size}</td>}
              </tr>
            </tbody>
          </table>
        )}
        {helpdeskHandmatigIngesteldStatus && helpdeskHandmatigIngesteldStatus?.status === 'missing' && (
          <div>Helpdesk Handmatig Ingesteld veld niet beschikbaar</div>
        )}
        {helpdeskHandmatigIngesteldStatus && helpdeskHandmatigIngesteldStatus?.status === 'error' && (
          <div>Helpdesk Handmatig Ingesteld veld fout</div>
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

export default HelpdeskHandmatigIngesteldTableComponent;

