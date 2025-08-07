import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { ParkingDetailsType } from "~/types/parking";
import ParkingEdit from '~/components/parking/ParkingEdit';
import { getParkingDetails } from "~/utils/parkings";
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useFietsenstallingen } from '~/hooks/useFietsenstallingen';
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

  // Use the useFietsenstallingen hook to fetch parkings
  const { fietsenstallingen, isLoading, error, reloadFietsenstallingen } = useFietsenstallingen(selectedGemeenteID);

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
    setFilteredParkings(fietsenstallingen);
  }, [fietsenstallingen]);

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

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'unauthenticated') {
    return null; // Will redirect in useEffect
  }

  const renderOverview = () => {
    if (isLoading) {
      return <LoadingSpinner />;
    }

    if (error) {
      return <div>Error: {error}</div>;
    }

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
        </div>
        <div className="overflow-x-auto">
          <Table 
            columns={[
              {
                header: 'Naam',
                accessor: 'Title',
                // className: 'px-6 py-4 whitespace-no-wrap border-b border-gray-200'
              },
              {
                header: 'Acties',
                accessor: (parking) => (
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
                // className: 'px-6 py-4 whitespace-no-wrap border-b border-gray-200'
              }
            ]}
            data={filteredParkings}
            className="min-w-full bg-white"
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
