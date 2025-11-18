import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Table } from '~/components/common/Table';
import { ConfirmPopover } from '~/components/ConfirmPopover';
import type { VSAbonnementsvormInLijst } from '~/types/abonnementsvormen';
import AbonnementsvormEdit from './AbonnementsvormEdit';

type AbonnementsvormenComponentProps = {};

const AbonnementsvormenComponent: React.FC<AbonnementsvormenComponentProps> = () => {
  const { data: session } = useSession();
  const [abonnementsvormen, setAbonnementsvormen] = useState<VSAbonnementsvormInLijst[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentID, setCurrentID] = useState<number | 'new' | undefined>(undefined);
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [itemToToggle, setItemToToggle] = useState<number | null>(null);

  const fetchAbonnementsvormen = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/protected/abonnementsvormen');
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setAbonnementsvormen(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij het laden van abonnementsvormen');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAbonnementsvormen();
  }, []);

  const handleEdit = (id: number | 'new') => {
    setCurrentID(id);
  };

  const handleToggleActive = async (id: number) => {
    try {
      const item = abonnementsvormen.find(av => av.ID === id);
      if (!item) return;

      const response = await fetch(`/api/protected/abonnementsvormen/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActief: !item.isActief }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle status');
      }

      fetchAbonnementsvormen();
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('Er is een fout opgetreden bij het wijzigen van de status.');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent<HTMLElement>, id: number) => {
    setDeleteAnchorEl(e.currentTarget);
    setItemToDelete(id);
  };

  const handleDeleteCancel = () => {
    setDeleteAnchorEl(null);
    setItemToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      const response = await fetch(`/api/protected/abonnementsvormen/${itemToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete');
      }

      fetchAbonnementsvormen();
      setCurrentID(undefined);
    } catch (err) {
      console.error('Error deleting abonnementsvorm:', err);
      alert(err instanceof Error ? err.message : 'Er is een fout opgetreden bij het verwijderen.');
    } finally {
      setDeleteAnchorEl(null);
      setItemToDelete(null);
    }
  };

  const handleCloseEdit = (success: boolean) => {
    setCurrentID(undefined);
    if (success) {
      fetchAbonnementsvormen();
    }
  };

  const formatPrice = (price: number | null): string => {
    if (price === null) return '-';
    return `€ ${price.toFixed(2).replace('.', ',')}`;
  };

  const renderOverview = () => {
    if (isLoading) {
      return <LoadingSpinner message="Abonnementsvormen laden" />;
    }

    if (error) {
      return <div className="text-red-500">Error: {error}</div>;
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Abonnementsvormen</h1>
          <button 
            onClick={() => handleEdit('new')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe abonnementsvorm
          </button>
        </div>

        <Table 
          columns={[
            {
              header: 'Naam',
              accessor: (item: VSAbonnementsvormInLijst) => (
                <span className={!item.isActief ? 'text-gray-500' : ''}>{item.naam || '-'}</span>
              )
            },
            {
              header: 'Duur',
              accessor: (item: VSAbonnementsvormInLijst) => 
                item.tijdsduur ? `${item.tijdsduur} maanden` : '-'
            },
            {
              header: 'Prijs',
              accessor: (item: VSAbonnementsvormInLijst) => formatPrice(item.prijs)
            },
            {
              header: 'Stallingstype',
              accessor: (item: VSAbonnementsvormInLijst) => 
                item.bikeparkTypeName || '-'
            },
            {
              header: 'Acties',
              accessor: (item: VSAbonnementsvormInLijst) => {
                return (
                  <>
                    <button 
                      onClick={() => handleToggleActive(item.ID)} 
                      className="mx-1"
                      title={item.isActief ? "Deactiveren" : "Activeren"}
                    >
                      {item.isActief ? (
                        <span className="text-green-500 text-xl">●</span>
                      ) : (
                        <span className="text-red-500 text-xl">●</span>
                      )}
                    </button>
                    <button 
                      onClick={() => handleEdit(item.ID)} 
                      className="text-yellow-500 mx-1"
                      title="Bewerken"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={(e) => handleDeleteClick(e, item.ID)} 
                      className="text-red-500 mx-1 disabled:opacity-40"
                      disabled={item.hasSubscriptions}
                      title={item.hasSubscriptions ? "Kan niet verwijderen: er zijn actieve abonnementen" : "Verwijderen"}
                    >
                      🗑️
                    </button>
                  </>
                );
              }
            }
          ]}
          data={abonnementsvormen}
          getRowClassName={(item) => !item.isActief ? 'opacity-50 bg-gray-100' : ''}
          className="mt-4"
        />

        <ConfirmPopover
          open={Boolean(deleteAnchorEl)}
          anchorEl={deleteAnchorEl}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Abonnementsvorm verwijderen"
          message="Weet je zeker dat je deze abonnementsvorm wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
          confirmText="Verwijderen"
          cancelText="Annuleren"
        />
      </div>
    );
  };

  if (currentID !== undefined) {
    return (
      <AbonnementsvormEdit 
        id={currentID} 
        onClose={handleCloseEdit} 
      />
    );
  }

  return renderOverview();
};

export default AbonnementsvormenComponent;

