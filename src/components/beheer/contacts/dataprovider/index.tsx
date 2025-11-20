import React, { useEffect, useState } from 'react';

import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import DataproviderEdit from "~/components/contact/DataproviderEdit";
import { useDataproviders } from '~/hooks/useDataproviders';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { Table } from '~/components/common/Table';
import { SearchFilter } from '~/components/common/SearchFilter';
import { VSSecurityTopic, VSCRUDRight } from '~/types/securityprofile';
import { getSecurityRights, allowNone } from '~/utils/client/security-profile-tools';
import { userHasRight } from '~/types/utils';
import { ConfirmPopover } from '~/components/ConfirmPopover';

type DataproviderComponentProps = { 
};

const DataproviderComponent: React.FC<DataproviderComponentProps> = (props) => {
  const router = useRouter();
  const { data: session } = useSession();

  const [currentContactID, setCurrentContactID] = useState<string | undefined>(undefined);
  const [sortColumn, setSortColumn] = useState<string>("Naam");
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const {dataproviders, isLoading, error, reloadDataproviders } = useDataproviders();
  
  const [filterText, setFilterText] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"Actief" | "Verwijderd">("Actief");
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);

  const hasFietsberaadSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const filteredContacts = dataproviders.filter(contact => {
    const matchesText = contact.CompanyName?.toLowerCase().includes(filterText.toLowerCase());
    const matchesArchiveFilter = archiveFilter === "Actief" 
      ? contact.Status === "1" 
      : contact.Status === "0";
    return matchesText && matchesArchiveFilter;
  });

  useEffect(() => {
    // get the id from the url
    if("id" in router.query) {
      const id = router.query.id;
      if(id) {
        setCurrentContactID(id as string);
      }
    }   
  }, [router.query.id, dataproviders]);

  const handleEditContact = (id: string) => {
    setCurrentContactID(id);
  };

  const handleArchiveContact = async (id: string) => {
    try {
      const response = await fetch(`/api/protected/dataprovider/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Status: "0" }),
      });
      if (!response.ok) {
        throw new Error('Failed to archive dataprovider');
      }

      reloadDataproviders();
    } catch (error) {
      console.error('Error archiving dataprovider:', error);
      alert('Er is een fout opgetreden bij het archiveren van de dataleverancier.');
    }
  };

  const handleUnarchiveContact = async (id: string) => {
    try {
      const response = await fetch(`/api/protected/dataprovider/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Status: "1" }),
      });
      if (!response.ok) {
        throw new Error('Failed to unarchive dataprovider');
      }

      reloadDataproviders();
    } catch (error) {
      console.error('Error unarchiving dataprovider:', error);
      alert('Er is een fout opgetreden bij het herstellen van de dataleverancier.');
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
      const response = await fetch(`/api/protected/dataprovider/${contactToDelete}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete dataprovider');
      }

      reloadDataproviders();
      setCurrentContactID(undefined);
    } catch (error) {
      console.error('Error deleting dataprovider:', error);
      alert('Er is een fout opgetreden bij het verwijderen van de dataleverancier.');
    } finally {
      setDeleteAnchorEl(null);
      setContactToDelete(null);
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
    const sorted = [...filteredContacts].sort((a, b) => {
      let aValue: string = '';
      let bValue: string = '';

      switch (sortColumn) {
        case 'Naam':
          aValue = a.CompanyName || '';
          bValue = b.CompanyName || '';
          break;
        case 'Naam in URL':
          aValue = a.UrlName || '';
          bValue = b.UrlName || '';
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
    if (isLoading) {
      return <LoadingSpinner />;
    }

    let rights: VSCRUDRight = getSecurityRights(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
    console.log("rights", rights);

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-2xl font-bold">
              {archiveFilter === "Actief" ? "Dataleveranciers" : "Gearchiveerde dataleveranciers"}
            </h1>
            {dataproviders.length > 20 && (
              <input
                type="text"
                placeholder="Filter op naam..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="px-3 py-1 border rounded-md flex-1 max-w-md"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasFietsberaadSuperadmin && (
              <button
                onClick={() => setArchiveFilter(archiveFilter === "Actief" ? "Verwijderd" : "Actief")}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                {archiveFilter === "Actief" ? "Gearchiveerde dataleveranciers" : "Terug"}
              </button>
            )}
            { rights.create && archiveFilter === "Actief" && <button 
              onClick={() => handleEditContact('new')}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Nieuwe Dataleverancier
            </button> }
          </div>
        </div>

        <SearchFilter
          id="dataproviderName"
          label="Data-leverancier:"
          value={filterText}
          onChange={(value) => setFilterText(value)}
        />

        <Table 
          columns={[
            {
              header: 'Naam',
              accessor: 'CompanyName'
            },
            {
              header: 'Naam in URL',
              accessor: 'UrlName'
            },
            {
              header: '',
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
                        disabled={!rights.update}
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
          className="mt-4 min-w-full bg-white"
          sortableColumns={["Naam", "Naam in URL"]}
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
    const showDataproviderEdit = currentContactID !== undefined;

    if(!showDataproviderEdit) {
      return null;
    }

    const handleOnClose = async (confirmClose = false) => {
      if (confirmClose && (confirm('Wil je het bewerkformulier verlaten?')===false)) { 
        return;
      }
        
      if(showDataproviderEdit) {
        reloadDataproviders();
        setCurrentContactID(undefined);
      } 
    }

    if(currentContactID !== undefined) {
      if(showDataproviderEdit) {
        return (
          <DataproviderEdit 
            id={currentContactID} 
            onClose={handleOnClose} 
          />
        );
      }
    }
  };

  return (
    <div>
      {currentContactID === undefined ? renderOverview() : renderEdit()}
    </div>
  );
};

export default DataproviderComponent;
