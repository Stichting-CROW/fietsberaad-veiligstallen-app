import React, { useState } from 'react';
// import { type ReportBikepark } from '../reports/ReportsFilter'; // Adjust the import path if necessary
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';
import CacheTableComponent from './CacheTable';
import UserContactRoleTableComponent from './UserContactRoleTable';
import UserStatusTableComponent from './UserStatusTable';

interface DatabaseComponentProps {
  firstDate: Date;
  lastDate: Date;
  bikeparks: VSFietsenstallingLijst[] | undefined;
}

const DatabaseComponent: React.FC<DatabaseComponentProps> = ({ firstDate, lastDate, bikeparks }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleTestUpdateCache = async (full: boolean) => {
    setIsLoading(true);
    setLastResult(null);
    
    try {
      const response = await fetch('/api/protected/database/test-update-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setLastResult(`✅ ${result.message}`);
      } else {
        setLastResult(`❌ Error: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setLastResult(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Database</h1>
      <UserStatusTableComponent />
      <UserContactRoleTableComponent />
      <CacheTableComponent
        title="Transactie cache tabel"
        cacheEndpoint="/api/protected/database/transactionscache"
        firstDate={firstDate}
        lastDate={lastDate}
        bikeparks={bikeparks}
      />
      <CacheTableComponent
        title="Bezettingen cache tabel"
        cacheEndpoint="/api/protected/database/bezettingencache"
        firstDate={firstDate}
        lastDate={lastDate}
        bikeparks={bikeparks}
      />
      <CacheTableComponent
        title="Stallingsduur cache tabel"
        cacheEndpoint="/api/protected/database/stallingsduurcache"
        firstDate={firstDate}
        lastDate={lastDate}
        bikeparks={bikeparks}
      />
      
      {/* Temporary section for validate incremental update */}
      {/* <div className="mt-8 p-6 bg-gray-50 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Validate Incremental Update</h2>
        <div className="flex gap-4">
          <button
            className={`px-6 py-3 text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
            }`}
            onClick={() => handleTestUpdateCache(true)}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'GO FULL'}
          </button>
          <button
            className={`px-6 py-3 text-white font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
            onClick={() => handleTestUpdateCache(false)}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'GO INCREMENTAL'}
          </button>
        </div>
        
        {lastResult && (
          <div className="mt-4 p-3 bg-white rounded-lg border">
            <p className="text-sm font-medium">{lastResult}</p>
          </div>
        )}
        
        <p className="text-sm text-gray-600 mt-3">
          Test section for cache update functionality - calls /api/protected/database/test-update-cache
        </p>
      </div> */}
    </div>
  );
};

export default DatabaseComponent;
