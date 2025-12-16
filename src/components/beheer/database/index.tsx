import React, { useState } from 'react';
// import { type ReportBikepark } from '../reports/ReportsFilter'; // Adjust the import path if necessary
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';
import CacheTableComponent from './CacheTable';
import CacheUpdateComponent from './CacheUpdate';
import PagesFaqUpdateComponent from './PagesFaqUpdate';
import UserContactRoleTableComponent from './UserContactRoleTable';
import UserStatusTableComponent from './UserStatusTable';
import HelpdeskHandmatigIngesteldTableComponent from './HelpdeskHandmatigIngesteldTable';
import OrphanedSectionsCleanup from './OrphanedSectionsCleanup';

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
      <h1 className="text-3xl font-bold mb-4">Database beheer</h1>
      <CacheUpdateComponent />
      <PagesFaqUpdateComponent />
      <OrphanedSectionsCleanup />
      <UserStatusTableComponent />
      <HelpdeskHandmatigIngesteldTableComponent />
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
    </div>
  );
};

export default DatabaseComponent;
