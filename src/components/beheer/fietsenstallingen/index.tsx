import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { ParkingDetailsType } from "~/types/parking";
import ParkingEdit from '~/components/parking/ParkingEdit';
import { getParkingDetails } from "~/utils/parkings";
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useFietsenstallingen } from '~/hooks/useFietsenstallingen';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import { useSession } from 'next-auth/react';
import { Table } from '~/components/common/Table';

interface FietsenstallingenComponentProps {
  type: 'fietsenstallingen' | 'fietskluizen' | 'buurtstallingen';
}

const FietsenstallingenComponent: React.FC<FietsenstallingenComponentProps> = ({ type }) => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const selectedGemeenteID = session?.user?.activeContactId || "";

  const [currentParkingId, setCurrentParkingId] = useState<string | undefined>(undefined);
  const [currentParking, setCurrentParking] = useState<ParkingDetailsType | undefined>(undefined);
  const [currentRevision, setCurrentRevision] = useState<number>(0);
  const [filteredParkings, setFilteredParkings] = useState<any[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('Naam');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedVisibilityFilter, setSelectedVisibilityFilter] = useState<string>('all');

  // Use the useFietsenstallingen hook to fetch parkings
  const { fietsenstallingen, isLoading, error, reloadFietsenstallingen } = useFietsenstallingen(selectedGemeenteID);
  const { fietsenstallingtypen, isLoading: typesLoading } = useFietsenstallingtypen();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/beheer/fietsenstallingen');
    }
  }, [status, router]);

  useEffect(() => {
    if (currentParkingId !== undefined) {
      if(currentParking === undefined || currentParking?.ID !== currentParkingId) {
        console.log('currentParkingId', currentParkingId)
        getParkingDetails(currentParkingId).then((parking) => {
          if (parking !== null) {
            setCurrentParking(parking);
          } else {
            console.error("Failed to load parking with ID: " + currentParkingId);
            setCurrentParking(undefined);
          }
        });
      }
    } else {
      if(currentParking !== undefined) {
        setCurrentParking(undefined);
      }
    }
  }, [currentParkingId, currentRevision]);

  useEffect(() => {
    if("id" in router.query) {
      const id = router.query.id;
      if(id) {
        setCurrentParkingId(id as string);
      }
    }   
  }, [router.query.id]);

  useEffect(() => {
    let filtered = fietsenstallingen;

    // Apply type filter
    if (selectedTypeFilter !== 'all') {
      filtered = filtered.filter(parking => parking.Type === selectedTypeFilter);
    }

    // Apply visibility filter
    if (selectedVisibilityFilter !== 'all') {
      if (selectedVisibilityFilter === 'public') {
        // Show all types except buurtstalling and fietstrommel
        filtered = filtered.filter(parking => 
          parking.Type !== 'buurtstalling' && parking.Type !== 'fietstrommel'
        );
      } else if (selectedVisibilityFilter === 'private') {
        // Show only buurtstalling and fietstrommel
        filtered = filtered.filter(parking => 
          parking.Type === 'buurtstalling' || parking.Type === 'fietstrommel'
        );
      }
    }

    setFilteredParkings(filtered);
  }, [fietsenstallingen, selectedTypeFilter, selectedVisibilityFilter]);

  const handleEdit = (id: string) => {
    setCurrentParkingId(id);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Weet je zeker dat je deze stalling wilt verwijderen?')) {
      try {
        const response = await fetch(`/api/protected/fietsenstallingen/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete parking');
        }

        reloadFietsenstallingen();
      } catch (error) {
        console.error('Error deleting parking:', error);
        alert('Er is een fout opgetreden bij het verwijderen van de stalling');
      }
    }
  };

  const handleClose = (confirmClose = false) => {
    if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?') === false)) {
      return;
    }
    setCurrentParkingId(undefined);
    // Refresh the fietsenstallingen list
    reloadFietsenstallingen();
  };

  const handleSort = (header: string) => {
    if (sortColumn === header) {
      // If clicking the same column, cycle through: asc → desc → no sort
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(undefined);
        setSortDirection('asc');
      }

    } else {
      // New column, start with ascending
      setSortColumn(header);
      setSortDirection('asc');
    }
  };

  const sortedParkings = React.useMemo(() => {
    if (!sortColumn) {
      return filteredParkings;
    }

    return [...filteredParkings].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortColumn === 'Naam') {
        aValue = a.Title || '';
        bValue = b.Title || '';
      } else if (sortColumn === 'Status') {
        aValue = a.Status || '';
        bValue = b.Status || '';
      } else if (sortColumn === 'Type') {
        aValue = a.fietsenstalling_type?.name || a.Type || '';
        bValue = b.fietsenstalling_type?.name || b.Type || '';
      } else {
        return 0;
      }

      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  }, [filteredParkings, sortColumn, sortDirection]);

  const getStatusDisplay = (status: string | null) => {
    if (status === "1") {
      return <span className="text-green-500">●</span>;
    } else if (status === "0") {
      return <span className="text-red-500">●</span>;
    } else if (status === "aanm" || status === "new") {
      return "New";
    }
    return status || '';
  };

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect in useEffect
  }

  const renderOverview = () => {
    if (isLoading || typesLoading) {
      return <LoadingSpinner />;
    }

    if (error) {
      return <div>Error: {error}</div>;
    }

    const showTypeColumn = selectedTypeFilter === 'all';

    return (
      <div>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Vind stalling..."
            className="w-full p-2 border rounded"
            onChange={(e) => {
              const searchTerm = e.target.value.toLowerCase();
              setFilteredParkings(
                fietsenstallingen.filter(parking =>
                  parking.Title?.toLowerCase().includes(searchTerm)
                )
              );
            }}
          />
          
          {/* Filters */}
          <div className="flex gap-4">
            {/* Visibility filter */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Toegang
              </label>
              <select
                value={selectedVisibilityFilter}
                onChange={(e) => setSelectedVisibilityFilter(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="all">Alle</option>
                <option value="public">Openbaar</option>
                <option value="private">Beperkt</option>
              </select>
            </div>
            {/* Type filter */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="all">Alle types</option>
                {fietsenstallingtypen.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

          </div>
        </div>
        
        <div className="overflow-x-auto">
          <Table 
            columns={[
              {
                header: 'Naam',
                accessor: 'Title',
              },
              ...(showTypeColumn ? [{
                header: 'Type',
                accessor: (parking: ParkingDetailsType) => parking.fietsenstalling_type?.name || parking.Type || '',
              }] : []),
              {
                header: 'Status',
                accessor: (parking: ParkingDetailsType) => getStatusDisplay(parking.Status),
              },
              {
                header: 'Acties',
                accessor: (parking: ParkingDetailsType) => (
                  <>
                    <button
                      onClick={() => handleEdit(parking.ID)}
                      className="text-yellow-500 mx-1 disabled:opacity-40"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(parking.ID)}
                      className="text-red-500 mx-1 disabled:opacity-40"
                    >
                      🗑️
                    </button>
                  </>
                ),
              }
            ]}
            data={sortedParkings}
            className="min-w-full bg-white"
            sortableColumns={['Naam', 'Status', ...(showTypeColumn ? ['Type'] : [])]}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        </div>
      </div>
    );
  };

  const renderEdit = () => {
    if (currentParkingId === undefined) {
      return null;
    }

    if (!currentParking) {
      return <LoadingSpinner />;
    }

    return (
      <ParkingEdit
        parkingdata={currentParking}
        onClose={handleClose}
        onChange={() => setCurrentRevision(prev => prev + 1)}
      />
    );
  };

  return (
    <div>
      {currentParkingId === undefined ? renderOverview() : renderEdit()}
    </div>
  );
};

export default FietsenstallingenComponent;
