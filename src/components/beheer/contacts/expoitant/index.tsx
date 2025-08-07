import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { useRouter } from 'next/router';
import ExploitantEdit from "~/components/contact/ExploitantEdit";

import type { VSContactExploitant} from "~/types/contacts";

import { makeClientApiCall } from '~/utils/client/api-tools';
import { useExploitanten } from '~/hooks/useExploitanten';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { type ExploitantGemeenteResponse } from '~/pages/api/protected/exploitant/[id]/gemeenten/[gemeenteid]';

type ExploitantComponentProps = { 
  contactID: string | undefined;
  canManageExploitants?: boolean;
  canAddRemoveExploitants?: boolean;
};

const ExploitantComponent: React.FC<ExploitantComponentProps> = (props) => {
  const router = useRouter();
  const { data: session } = useSession();

  const { exploitanten, isLoading: isLoadingExploitanten, error: errorExploitanten, reloadExploitanten } = useExploitanten(props.contactID);
  const { exploitanten:allExploitanten, isLoading: isLoadingAllExploitanten, error: errorAllExploitanten, reloadExploitanten: reloadAllExploitanten } = useExploitanten(undefined);
  const { gemeenten, isLoading: isLoadingGemeenten, error: errorGemeenten } = useGemeentenInLijst();

  const [currentContactID, setCurrentContactID] = useState<string | undefined>(undefined);
  const [filterText, setFilterText] = useState("");

  const [addRemoveExploitant, setAddRemoveExploitant] = useState<boolean>(false);
  const [toggledExploitantIds, setToggledExploitantIds] = useState<Set<string>>(new Set());

  const filteredContacts = (addRemoveExploitant ? allExploitanten : exploitanten).filter(contact => 
    contact.CompanyName?.toLowerCase().includes(filterText.toLowerCase())
  );

  useEffect(() => {
    if("id" in router.query) {
      const id = router.query.id;
      if(id) {
        setCurrentContactID(id as string);
      }
    }   
  }, [router.query.id, exploitanten]);

  const handleEdit = (id: string) => {
    setCurrentContactID(id);
  };

  const handleDelete = async(id: string) => {
    if(confirm("Weet je zeker dat je deze exploitant wilt verwijderen?")) {
      const response = await makeClientApiCall<VSContactExploitant>(`/api/protected/exploitant/${id}`, "DELETE");
      if(response.success) {
        alert("Exploitant verwijderd");

        reloadExploitanten(); // Refresh the list after deletion
        reloadAllExploitanten(); // Refresh the list of all exploitanten
      } else {
        alert("Er is een fout opgetreden bij het verwijderen van de exploitant.");
        console.error("Unable to delete contact:", response.error);
      }
    }
  };

  const getGemeenten = (contact: VSContactExploitant) => {
    const gemeenteIDs = contact.isManagingContacts?.map(c => c.childSiteID);
    const selected = gemeenteIDs.map(id=>{
      const gemeente = gemeenten.find(g => g.ID === id);
      return gemeente ? gemeente.CompanyName : "Onbekende gemeente";
    });
    return selected.sort().map(g=><>{g}<br/></>);
  }

  const handleToggleExploitant = (exploitantID: string, isSelected: boolean) => {
    setToggledExploitantIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(exploitantID)) {
        newSet.delete(exploitantID);
      } else {
        newSet.add(exploitantID);
      }
      return newSet;
    });
  };

  const handleSaveChanges = async () => {
    // const changes = Array.from(toggledExploitantIds).map(id => {
    //   const contact = allExploitanten.find(e => e.ID === id);
    //   const isCurrentlySelected = exploitanten.some(e => e.ID === id);
    //   return `${contact?.CompanyName} (${isCurrentlySelected ? 'verwijderen' : 'toevoegen'})`;
    // });
    // alert(`De volgende wijzigingen worden doorgevoerd:\n${changes.join('\n')}`);

    const activeContactId = session?.user?.activeContactId;
    if(activeContactId === undefined) {
      alert("No active contact ID found");
      return;
    }

    for(const id of Array.from(toggledExploitantIds)) {
      const isCurrentlySelected = exploitanten.some(e => e.ID === id); // is exploitant 
      if(isCurrentlySelected===false) {
        // add link
        const url = `/api/protected/exploitant/${id}/gemeenten/${ activeContactId}`;
        const response = await makeClientApiCall<ExploitantGemeenteResponse>(url, 'POST', { admin: true });
        if(!response.success) {
          console.error("Failed to add link to exploitant: " + id + " " + currentContactID);
          return;
        }
      } else {
        // remove link
        const url = `/api/protected/exploitant/${id}/gemeenten/${activeContactId}`;
        const response = await makeClientApiCall<ExploitantGemeenteResponse>(url, 'DELETE', { });
        if(!response.success) {
          console.error("Failed to remove link from exploitant: " + id + " " + activeContactId);
          return;
        }
      }
    }
    
    setToggledExploitantIds(new Set());
    setAddRemoveExploitant(false);

    reloadExploitanten();
    reloadAllExploitanten();
  };

  const handleCancelChanges = () => {
    setToggledExploitantIds(new Set());
    setAddRemoveExploitant(false);
  };

  const renderOverview = () => {
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-2xl font-bold">Exploitanten</h1>
            {exploitanten.length > 20 && (
              <input
                type="text"
                placeholder="Filter op naam..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="px-3 py-1 border rounded-md flex-1 max-w-md"
              />
            )}
          </div>
          { props.canManageExploitants && <button 
            onClick={() => handleEdit('new')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Nieuwe Exploitant
          </button>}
          { props.canAddRemoveExploitants && (
            addRemoveExploitant ? (
              <div className="flex gap-2">
                <button 
                  onClick={handleSaveChanges}
                  disabled={toggledExploitantIds.size === 0}
                  className={`font-bold py-2 px-4 rounded ${
                    toggledExploitantIds.size === 0 
                      ? 'bg-gray-300 cursor-not-allowed' 
                      : 'bg-green-500 hover:bg-green-700'
                  } text-white`}
                >
                  Opslaan
                </button>
                <button 
                  onClick={handleCancelChanges}
                  className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                >
                  Afbreken
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setAddRemoveExploitant(true)}
                className="bg-gray-300 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Exploitanten Beheren
              </button>
            )
          )}
        </div>
        <table className="min-w-full bg-white">
          <thead>
              <th className="py-2">Naam</th>
              <th className="py-2">E-mail</th>
              {props.canManageExploitants && <th className="py-2">Gemeente(n)</th>}
              <th className="py-2">Actief</th>
              {props.canManageExploitants && <th className="py-2">Acties</th>}
              {addRemoveExploitant && <th className="py-2">Heeft toegang</th>}
          </thead>
          <tbody>
            {filteredContacts.sort((a, b) => (a.CompanyName || '').localeCompare(b.CompanyName || '')).map((contact) => { 

              // currentContactID is managed by contact.ID
              const isSelected = exploitanten.some(e => e.ID === contact.ID);

              return (
                <tr key={contact.ID}>
                  <td className="border px-4 py-2">{contact.CompanyName}</td>
                  <td className="border px-4 py-2">{contact.Helpdesk}</td>
                  {props.canManageExploitants && <td className="border px-4 py-2">{getGemeenten(contact)}</td>}
                  <td className="border px-4 py-2">
                    {contact.Status === "1" ? 
                      <span className="text-green-500">●</span> : 
                      <span className="text-red-500">●</span>
                    }
                  </td>
                  {props.canManageExploitants && (
                      <td className="border px-4 py-2">
                        <button onClick={() => handleEdit(contact.ID)} className="text-yellow-500 mx-1 disabled:opacity-40">✏️</button>
                        <button onClick={() => handleDelete(contact.ID)} className="text-red-500 mx-1 disabled:opacity-40">🗑️</button>
                      </td>
                  )}
                  {addRemoveExploitant && (
                    <td className="border px-4 py-2">
                      <div className="flex items-center gap-1">
                        <input 
                          type="checkbox" 
                          checked={toggledExploitantIds.has(contact.ID) ? !isSelected : isSelected} 
                          onChange={() => handleToggleExploitant(contact.ID, isSelected)} 
                        />
                        {toggledExploitantIds.has(contact.ID) && (
                          <span>*</span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderEdit = (isSm = false) => {
    const showExploitantEdit = currentContactID !== undefined;

    if(!showExploitantEdit) {
      return null;
    }

    const handleOnClose = async (verbose = false) => {
      if (verbose && (confirm('Wil je het bewerkformulier verlaten?')===false)) { 
        return;
      }
        
      if(showExploitantEdit) {
        reloadExploitanten();
        reloadAllExploitanten();
        setCurrentContactID(undefined);
      } 
    }

    if(currentContactID !== undefined) {
      if(showExploitantEdit) {
          return (
          <ExploitantEdit 
            id={currentContactID} 
            onClose={() => { 
              setCurrentContactID(undefined); 

              reloadExploitanten(); // Refresh the list after edit
              reloadAllExploitanten(); // Refresh the list of all exploitanten
            }} 
          />
        );
      }
    }
  };

  // isLoadingUsers || 
  //         isLoadingUsers && "Gebruikers",

  if(isLoadingExploitanten || isLoadingGemeenten || isLoadingAllExploitanten) {
    const whatIsLoading = [
        isLoadingExploitanten && "Exploitanten",
        isLoadingGemeenten && "Gemeenten",
    ].filter(Boolean).join(" + ");
    
    return <LoadingSpinner message={whatIsLoading + ' laden'} />;
  }

  // errorUsers ||
  // errorUsers || 
  if( errorExploitanten || errorGemeenten || errorAllExploitanten) {
    return <div>Error: {errorExploitanten || errorGemeenten || errorAllExploitanten}</div>;
  }
  
  return (
    <div>
      {currentContactID === undefined ? renderOverview() : renderEdit()}
    </div>
  );
};

export default ExploitantComponent;
