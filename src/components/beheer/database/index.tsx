import React from 'react';
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
    </div>
  );
};

export default DatabaseComponent;
