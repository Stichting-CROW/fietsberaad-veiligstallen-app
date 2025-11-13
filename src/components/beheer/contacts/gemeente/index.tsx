import React, { useEffect, useState } from 'react';

import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import GemeenteEdit from "~/components/contact/GemeenteEdit";
import type { VSFietsenstallingType } from "~/types/parking";
import ParkingEdit from '~/components/parking/ParkingEdit';
import GemeenteFilter from '~/components/beheer/common/GemeenteFilter';
import { getParkingDetails } from "~/utils/parkings";
import type { VSContactGemeenteInLijst } from "~/types/contacts";
import type { ParkingDetailsType } from "~/types/parking";
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useUsers } from '~/hooks/useUsers';
import { useExploitanten } from '~/hooks/useExploitanten';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Table } from '~/components/common/Table';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';
import { ConfirmPopover } from '~/components/ConfirmPopover';

type GemeenteComponentProps = { 
  fietsenstallingtypen: VSFietsenstallingType[]  
};

const GemeenteComponent: React.FC<GemeenteComponentProps> = (props) => {
  const router = useRouter();
  const { data: session } = useSession();
  const { fietsenstallingtypen } = props;

  const [filteredGemeenten, setFilteredGemeenten] = useState<VSContactGemeenteInLijst[]>([]);
  const [currentContactID, setCurrentContactID] = useState<string | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("Naam");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [archiveFilter, setArchiveFilter] = useState<"Actief" | "Verwijderd">("Actief");
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);

  const { users, isLoading: isLoadingUsers, error: errorUsers } = useUsers();
  const { gemeenten, reloadGemeenten, isLoading: isLoadingGemeenten, error: errorGemeenten } = useGemeentenInLijst();
  const { exploitanten, isLoading: isLoadingExploitanten, error: errorExploitanten } = useExploitanten(undefined);

  const hasFietsberaadSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

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

  const handleArchiveContact = async (id: string) => {
    try {
      const response = await fetch(`/api/protected/gemeenten/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Status: "0" }),
      });
      if (!response.ok) {
        throw new Error('Failed to archive gemeente');
      }

      reloadGemeenten();
    } catch (error) {
      console.error('Error archiving gemeente:', error);
      alert('Er is een fout opgetreden bij het archiveren van de data-eigenaar.');
    }
  };

  const handleUnarchiveContact = async (id: string) => {
    try {
      const response = await fetch(`/api/protected/gemeenten/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Status: "1" }),
      });
      if (!response.ok) {
        throw new Error('Failed to unarchive gemeente');
      }

      reloadGemeenten();
    } catch (error) {
      console.error('Error unarchiving gemeente:', error);
      alert('Er is een fout opgetreden bij het herstellen van de data-eigenaar.');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent<HTMLElement>, id: string) => {
    setDeleteAnchorEl(e.currentTarget);
    setContactToDelete(id);
  };

  const handleDeleteCancel = () => {
    setDeleteAnchorEl(null);
    setContactToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return;

    try {
      const response = await fetch(`/api/protected/gemeenten/${contactToDelete}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete gemeente');
      }

      reloadGemeenten();
      setCurrentContactID(undefined);
    } catch (error) {
      console.error('Error deleting gemeente:', error);
      alert('Er is een fout opgetreden bij het verwijderen van de data-eigenaar.');
    } finally {
      setDeleteAnchorEl(null);
      setContactToDelete(null);
    }
  };

  const getBeheert = (contact: VSContactGemeenteInLijst) => {
    const managedIDs = contact.isManagingContacts?.map(c => c.childSiteID) || [];
    const selected = managedIDs.map(id => {
      // Check if it's a gemeente
      const gemeente = gemeenten.find(g => g.ID === id);
      if (gemeente) return gemeente.CompanyName;
      // Check if it's an exploitant
      const exploitant = exploitanten.find(e => e.ID === id);
      if (exploitant) return exploitant.CompanyName;
      return "Onbekende organisatie";
    });
    return selected.sort().map(o => <>{o}<br/></>);
  };

  const getWordtBeheerdDoor = (contact: VSContactGemeenteInLijst) => {
    const exploitantIDs = contact.isManagedByContacts?.map(c => c.parentSiteID) || [];
    const selected = exploitantIDs.map(id => {
      const exploitant = exploitanten.find(e => e.ID === id);
      return exploitant ? exploitant.CompanyName : "Onbekende exploitant";
    });
    return selected.sort().map(e => <>{e}<br/></>);
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
    // Apply archive filter
    // Use filteredGemeenten which includes text filter from GemeenteFilter
    const sourceData = filteredGemeenten;
    const archiveFiltered = sourceData.filter(contact => {
      const matchesArchiveFilter = archiveFilter === "Actief" 
        ? contact.Status === "1" 
        : contact.Status === "0";
      return matchesArchiveFilter;
    });

    const sorted = [...archiveFiltered].sort((a, b) => {
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
          <h1 className="text-2xl font-bold">
            {archiveFilter === "Actief" ? "Data-eigenaren" : "Gearchiveerde data-eigenaren"}
          </h1>
          <div className="flex items-center gap-2">
            {hasFietsberaadSuperadmin && (
              <button
                onClick={() => setArchiveFilter(archiveFilter === "Actief" ? "Verwijderd" : "Actief")}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                {archiveFilter === "Actief" ? "Gearchiveerde data-eigenaren" : "Terug"}
              </button>
            )}
            {archiveFilter === "Actief" && (
              <button 
                onClick={() => handleEditContact('new')}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Nieuwe data-eigenaar
              </button>
            )}
          </div>
        </div>

        {archiveFilter === "Actief" ? (
          <GemeenteFilter
            gemeenten={gemeenten}
            users={users}
            exploitanten={exploitanten}
            onFilterChange={setFilteredGemeenten}
            showStallingenFilter={true}
            showUsersFilter={true}
            showExploitantenFilter={true}
            showModulesFilter={true}
          />
        ) : (
          <GemeenteFilter
            gemeenten={gemeenten}
            users={users}
            exploitanten={exploitanten}
            onFilterChange={setFilteredGemeenten}
            showStallingenFilter={false}
            showUsersFilter={false}
            showExploitantenFilter={false}
            showModulesFilter={false}
          />
        )}

        <Table 
          columns={[
            {
              header: 'Naam',
              accessor: 'CompanyName'
            },
            // TODO: Re-enable when needed
            // ...(hasFietsberaadSuperadmin ? [{
            //   header: "Beheert", 
            //   accessor: (contact: VSContactGemeenteInLijst) => getBeheert(contact)
            // }] : []),
            ...(hasFietsberaadSuperadmin ? [{
              header: "Wordt beheerd door", 
              accessor: (contact: VSContactGemeenteInLijst) => getWordtBeheerdDoor(contact)
            }] : []),
            {
              header: 'Acties',
              accessor: (contact) => {
                const isArchived = contact.Status === "0";
                const showArchive = !isArchived && hasFietsberaadSuperadmin;
                const showUnarchive = isArchived && hasFietsberaadSuperadmin && archiveFilter === "Verwijderd";
                const showDelete = isArchived && hasFietsberaadSuperadmin && archiveFilter === "Verwijderd";
                const showEdit = archiveFilter === "Actief";

                return (
                  <>
                    {showEdit && (
                      <button 
                        onClick={() => handleEditContact(contact.ID)} 
                        className="text-yellow-500 mx-1 disabled:opacity-40"
                        title="Bewerken"
                      >
                        ✏️
                      </button>
                    )}
                    {showArchive && (
                      <button 
                        onClick={() => handleArchiveContact(contact.ID)} 
                        className="text-blue-500 mx-1 disabled:opacity-40"
                        title="Archiveren"
                      >
                        📦
                      </button>
                    )}
                    {showUnarchive && (
                      <button 
                        onClick={() => handleUnarchiveContact(contact.ID)} 
                        className="text-green-500 mx-1 disabled:opacity-40"
                        title="Herstellen"
                      >
                        ↪️
                      </button>
                    )}
                    {showDelete && (
                      <button 
                        onClick={(e) => handleDeleteClick(e, contact.ID)} 
                        className="text-red-500 mx-1 disabled:opacity-40"
                        title="Verwijderen"
                      >
                        🗑️
                      </button>
                    )}
                  </>
                );
              }
            }
          ]}
          data={getSortedData()}
          className="mt-4"
          sortableColumns={["Naam"]}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />

        <ConfirmPopover
          open={Boolean(deleteAnchorEl)}
          anchorEl={deleteAnchorEl}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Organisatie verwijderen"
          message="Weet je zeker dat je deze organisatie wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
          confirmText="Verwijderen"
          cancelText="Annuleren"
        />
      </div>
    );
  };

  const renderEdit = (isSm = false) => {
    const showGemeenteEdit = currentContactID !== undefined;

    if(!showGemeenteEdit) {
      return null;
    }

    const handleOnClose = async (confirmClose = false) => {
      if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?')===false)) { 
        return;
      }
        
      if(showGemeenteEdit) {
        reloadGemeenten();
        setCurrentContactID(undefined);
      } 
    }

    return (
      <GemeenteEdit 
        id={currentContactID} 
        fietsenstallingtypen={fietsenstallingtypen} 
        onClose={handleOnClose} 
      />
    );
  };

  if(isLoadingUsers || isLoadingGemeenten || isLoadingExploitanten) {
    const whatIsLoading = [
        isLoadingUsers && "Gebruikers",
        isLoadingGemeenten && "Gemeenten",
        isLoadingExploitanten && "Exploitanten",
    ].filter(Boolean).join(" + ");
    return <LoadingSpinner message={whatIsLoading + ' laden'} />;
  }

  if(errorUsers || errorGemeenten || errorExploitanten) {
    return <div>Error: {errorUsers || errorGemeenten || errorExploitanten}</div>;
  }

  return (
    <div>
      {currentContactID === undefined ? renderOverview() : renderEdit()}
    </div>
  );
};

export default GemeenteComponent;
