import React, { useEffect, useState } from 'react';

import { useRouter } from 'next/router';
import GemeenteEdit from "~/components/contact/GemeenteEdit";
import type { VSFietsenstallingType } from "~/types/parking";
import ParkingEdit from '~/components/parking/ParkingEdit';
import GemeenteFilter from '~/components/beheer/common/GemeenteFilter';
import { getParkingDetails } from "~/utils/parkings";
import type { VSContactGemeenteInLijst } from "~/types/contacts";
import type { ParkingDetailsType } from "~/types/parking";
import { UserEditComponent } from '~/components/beheer/users/UserEditComponent';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useUsers } from '~/hooks/useUsers';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Table } from '~/components/common/Table';

type GemeenteComponentProps = { 
  fietsenstallingtypen: VSFietsenstallingType[]  
};

const GemeenteComponent: React.FC<GemeenteComponentProps> = (props) => {
  const router = useRouter();
  const { fietsenstallingtypen } = props;

  const [filteredGemeenten, setFilteredGemeenten] = useState<VSContactGemeenteInLijst[]>([]);
  const [currentContactID, setCurrentContactID] = useState<string | undefined>(undefined);
  const [currentStallingId, setCurrentStallingId] = useState<string | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [currentRevision, setCurrentRevision] = useState<number>(0);
  const [currentStalling, setCurrentStalling] = useState<ParkingDetailsType | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("Naam");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { users, isLoading: isLoadingUsers, error: errorUsers } = useUsers();
  const { gemeenten, reloadGemeenten, isLoading: isLoadingGemeenten, error: errorGemeenten } = useGemeentenInLijst();

  useEffect(() => {
    if (currentStallingId !== undefined) {
      if(currentStalling === undefined || currentStalling?.ID !== currentStallingId) {
        getParkingDetails(currentStallingId).then((stalling) => {
          if (null !== stalling) {
            setCurrentStalling(stalling);
          } else {
            console.error("Failed to load stalling with ID: " + currentStallingId);
            setCurrentStalling(undefined);
          }
        });
      }
    } else {
      if(currentStalling !== undefined) {
        setCurrentStalling(undefined);
      } 
    }
  }, [currentStallingId, currentRevision]);

  useEffect(() => {
    if("id" in router.query) {
      const id = router.query.id;
      if(id) {
        setCurrentContactID(id as string);
      }
    }   
  }, [router.query.id]);

  const handleEditContact = (id: string) => {
    setCurrentContactID(id);
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const response = await fetch(`/api/protected/gemeenten/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete gemeente');
      }

      reloadGemeenten();
      setCurrentContactID(undefined);
    } catch (error) {
      console.error('Error deleting gemeente:', error);
    }
  };

  const handleSort = (header: string) => {
    if (sortColumn === header) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(header);
      setSortDirection('asc');
    }
  };

  const getSortedData = () => {
    const sorted = [...filteredGemeenten].sort((a, b) => {
      let aValue: string = '';
      let bValue: string = '';

      switch (sortColumn) {
        case 'Naam':
          aValue = a.CompanyName || '';
          bValue = b.CompanyName || '';
          break;
        default:
          aValue = a.CompanyName || '';
          bValue = b.CompanyName || '';
      }

      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });

    return sorted;
  };

  const renderOverview = () => {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Data-eigenaren</h1>
          <button 
            onClick={() => handleEditContact('new')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe data-eigenaar
          </button>
        </div>

        <GemeenteFilter
          gemeenten={gemeenten}
          users={users}
          onFilterChange={setFilteredGemeenten}
          showStallingenFilter={true}
          showUsersFilter={true}
          showExploitantenFilter={true}
          showModulesFilter={true}
        />

        <Table 
          columns={[
            {
              header: 'Naam',
              accessor: 'CompanyName'
            },
            {
              header: 'Acties',
              accessor: (contact) => (
                <>
                  <button onClick={() => handleEditContact(contact.ID)} className="text-yellow-500 mx-1 disabled:opacity-40">✏️</button>
                  <button onClick={() => handleDeleteContact(contact.ID)} className="text-red-500 mx-1 disabled:opacity-40">🗑️</button>
                </>
              )
            }
          ]}
          data={getSortedData()}
          className="mt-4"
          sortableColumns={["Naam"]}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      </div>
    );
  };

  const renderEdit = (isSm = false) => {
    const showStallingEdit = currentStalling !== undefined;
    const showUserEdit = currentUserId !== undefined;
    const showGemeenteEdit = showStallingEdit || showUserEdit || currentContactID !== undefined;

    if(!showStallingEdit && !showGemeenteEdit && !showUserEdit) {
      return null;
    }

    const handleOnClose = async (confirmClose = false) => {
      if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?')===false)) { 
        return;
      }
        
      if(showUserEdit) {
        setCurrentUserId(undefined);
      } else if(showStallingEdit) {
        setCurrentStallingId(undefined);
      } else if(showGemeenteEdit) {
        reloadGemeenten();
        setCurrentContactID(undefined);
      } 
    }

    if(currentContactID !== undefined) {
      if(showUserEdit) {
        return (
          <UserEditComponent 
            id={currentUserId} 
            siteID={currentContactID}
            onClose={() => handleOnClose(true)}
          />
        );
      } else if(showStallingEdit) {
        return (
          <ParkingEdit 
            parkingdata={currentStalling} 
            onClose={() => handleOnClose(true)} 
            onChange={() => setCurrentRevision(prev => prev + 1)}
          />
        );
      } else if(showGemeenteEdit) {
        return (
          <GemeenteEdit 
            id={currentContactID} 
            fietsenstallingtypen={fietsenstallingtypen} 
            onClose={handleOnClose} 
            onEditStalling={(stallingID) => setCurrentStallingId(stallingID)}
            onEditUser={(userID) => setCurrentUserId(userID)}
            onSendPassword={(userID) => alert("send password to user " + userID)}
          />
        );
      }
    }
  };

  if(isLoadingUsers || isLoadingGemeenten) {
    const whatIsLoading = [
        isLoadingUsers && "Gebruikers",
        isLoadingGemeenten && "Gemeenten",
    ].filter(Boolean).join(" + ");
    return <LoadingSpinner message={whatIsLoading + ' laden'} />;
  }

  if(errorUsers || errorGemeenten) {
    return <div>Error: {errorUsers || errorGemeenten}</div>;
  }

  return (
    <div>
      {currentContactID === undefined && currentStalling === undefined && currentUserId === undefined ? renderOverview() : renderEdit()}
    </div>
  );
};

export default GemeenteComponent;
