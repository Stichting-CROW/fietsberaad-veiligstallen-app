import React, { useState, useEffect } from 'react';
import BikeparkSelect from '../reports/BikeparkSelect'; // Adjust the import path if necessary
import { type CacheParams, type CacheStatus, type CacheActions, type CacheResult } from "~/backend/services/database-service";
import moment from 'moment';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';

interface CacheTableComponentProps {
  title: string;
  cacheEndpoint: string;
  firstDate: Date;
  lastDate: Date;
  bikeparks: VSFietsenstallingLijst[] | undefined;
}

const CacheTableComponent: React.FC<CacheTableComponentProps> = ({ title, cacheEndpoint,firstDate, lastDate, bikeparks }) => {
  const [allDates, setAllDates] = useState<boolean>(true);
  const [allBikeparks, setAllBikeparks] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<Date>(() => {
    return moment(firstDate).toDate(); 
   });
  const [selectedBikeparkIDs, setSelectedBikeparkIDs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | undefined>(undefined);
  const [warningState, setWarningState] = useState<string | undefined>(undefined);

  const [cacheStatus, setCacheStatus] = useState<CacheStatus | undefined>(undefined);
  const [updateCounter, setUpdateCounter] = useState<number>(0);
  const [indicesExist, setIndicesExist] = useState<boolean>(false);

  useEffect(() => {
    const fetchCacheStatus = async () => {
      const databaseParams: CacheParams = {
        action: 'status',
        allDates,
        allBikeparks,
        startDate: startDate,
        endDate: lastDate,
        selectedBikeparkIDs
      };

      setLoading(true);
      try {
        const response = await fetch(cacheEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              databaseParams
            })
          })

          if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
          }

          const json = await response.json();
          setCacheStatus(json.status);
          if (json.status?.indexstatus === 'available') {
            setIndicesExist(true);
          } else {
            setIndicesExist(false);
          }
          setErrorState("");
      } catch (error) {
        console.error(error);
          setErrorState("Cache action failed");
        } finally {
          setLoading(false);
      }
    };

    fetchCacheStatus();
  }, [updateCounter]);

  const handleProcessCache = (action: CacheActions) => {
    const processCache = async () => {
      console.log(">>>>> processCache", action, allDates, allBikeparks, firstDate, lastDate, selectedBikeparkIDs);
      const databaseParams: CacheParams = {
        action,
        allDates,
        allBikeparks,
        startDate: startDate,
        endDate: lastDate,
        selectedBikeparkIDs
      };

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
          })

          if (!response.ok) {
            console.error("Cache action response - error", response);
            throw new Error(`Error: ${response}`);
          }
          
          const result = await response.json() as CacheResult;
          if(result.success && result.status) {
            setCacheStatus(result.status);
            setErrorState("");
          } else {
            setErrorState("Cache action failed");
            setUpdateCounter(updateCounter+1);
          }
      } catch (error) {
        console.error(error);
        setErrorState("Cache action failed");
        setUpdateCounter(updateCounter+1);
      } finally {
        setLoading(false);
      }
    };

    processCache();
  };

  const handleIndicesAction = async () => {
    const processCache = async () => {
      const databaseParams: CacheParams = {
        action: indicesExist ? 'dropparentindices' : 'createparentindices',
        allDates,
        allBikeparks,
        startDate: startDate,
        endDate: lastDate,
        selectedBikeparkIDs
      };

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
          })

          if (!response.ok) {
            console.error("Cache action response - error", response);
            throw new Error(`Error: ${response}`);
          }
          
          const result = await response.json() as CacheResult;
          if(result.success) {
            setIndicesExist(!indicesExist);
            setErrorState("");
            setUpdateCounter(updateCounter + 1);
          } else {
            setErrorState("Index action failed");
          }
      } catch (error) {
        console.error(error);
        setErrorState("Index action failed");
      } finally {
        setLoading(false);
      }
    };

    processCache();
  };

  const renderFilter = () => {
    return (
      <>
        <div className="flex flex-col items-left mb-4 p-2 border-2 border-gray-400 rounded-md w-1/3">
          {!allDates && (
            <>
              <label className="mr-2">Vanaf</label>
              <input
                type="date"
              value={moment(startDate).format('YYYY-MM-DD')}
              onChange={(e) => setStartDate(moment(e.target.value).toDate())}
              className="ml-4 p-2 border-2 border-gray-400 rounded-md mb-2"
            />
            </>
          )}
          <label className="mr-2">
            <input
              type="checkbox"
              className="mr-2"
              checked={allDates}
              onChange={() => setAllDates(!allDates)}
            />
            Alle datums
          </label>
        </div>

        <div className="w-1/3 p-2 border-2 border-gray-400 rounded-md">
          {!allBikeparks && bikeparks && (
            <div className="ml-2">
              <BikeparkSelect
                bikeparks={bikeparks}
                selectedBikeparkIDs={selectedBikeparkIDs}
                setSelectedBikeparkIDs={setSelectedBikeparkIDs}
                />
            </div>
          )}
        <label className="mr-2">
            <input
              type="checkbox"
              className="mr-2  mb-2"
              checked={allBikeparks}
              onChange={() => setAllBikeparks(!allBikeparks)}
            />
            Alle stallingen
          </label>
        </div>
      </>
    )
  }

  const renderActions = () => {
    return (
      <div className="flex flex-row space-x-2">
        {cacheStatus?.status==='available' ? (
          <>
            <button
              onClick={() => handleProcessCache('update')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Cache Tabel Vullen{!allBikeparks && selectedBikeparkIDs.length > 0 ? ` met ${selectedBikeparkIDs.length} stallingen` : ''}
            </button> 
            <button
              onClick={() => handleProcessCache('clear')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Cache Tabel Leegmaken
            </button> 
            <button
              onClick={() => handleProcessCache('droptable')}
              className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
            >
              Verwijder Cache Tabel
            </button>
          </>
        ) : (
          <button
            onClick={() => handleProcessCache('createtable')}
            className={`p-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white w-64`}
          >
            Genereer Cache Tabel
          </button>
        )}
      </div>
    );
  }

  const renderIndices = () => {
    return (
      <div className="flex flex-col space-y-2 mt-4">
        {!indicesExist && (
          <div className="text-red-600 font-bold">
            De Indices op de brondata ontbreken
          </div>
        )}
        <div className="flex flex-row space-x-2">
          <button
            onClick={handleIndicesAction}
            className={`p-2 rounded-md ${indicesExist ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'} text-white w-64`}
          >
            {indicesExist ? 'Verwijder indices van brondata' : 'Maak indices op brondata'}
          </button>
        </div>
      </div>
    );
  }

  const firstUpdate = cacheStatus?.firstUpdate && cacheStatus.firstUpdate!==null ? moment(cacheStatus.firstUpdate).toDate() : null;
  const lastUpdate = cacheStatus?.lastUpdate && cacheStatus.lastUpdate!==null ? moment(cacheStatus.lastUpdate).toDate() : null;

  return (
    <div className="bg-gray-200 border-2  border-gray-400 p-2 pl-4 rounded mb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="mt-4">
            {cacheStatus && cacheStatus?.status==='available' && (
                <table className="table-auto">
                <tbody>
                    <tr>
                      <td className="font-semibold">Aantal records:</td>
                      {cacheStatus.size && <td className="pl-2">{cacheStatus.size}</td>}
                      </tr>
                    <tr>
                      <td className="font-semibold">Eerste update:</td>
                      <td className="pl-2">{firstUpdate ? firstUpdate.toLocaleDateString() : 'nog geen data'}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Laatste update:</td>
                      <td className="pl-2">{lastUpdate ? lastUpdate.toLocaleDateString() : 'nog geen data'}</td> 
                    </tr>
                </tbody>
                </table>
            )}
            {cacheStatus && cacheStatus?.status==='missing' && (
                <div>Cache niet beschikbaar</div>
            )}
            {cacheStatus && cacheStatus?.status==='error' && (
                <div>Cache fout</div>
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
            { !loading && cacheStatus?.status==='available' && renderFilter() }
            { !loading && renderActions() }
            { !loading && renderIndices() }
        </div>
    </div>
  );
};

export default CacheTableComponent;
