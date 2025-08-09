import React, { useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useUser } from "~/hooks/useUser";

import { VSMenuTopic } from "~/types/index";
import { VSUserRoleValuesNew } from "~/types/users";
import { LoadingSpinner } from "./beheer/common/LoadingSpinner";
import { ExploreUserSecurityProfileComponent } from "./ExploreUserSecurityProfileComponent";

interface ExploreUserDetailsComponentProps {
    selectedUserID: string;
    contacts: {ID: string, CompanyName: string}[];
}

export const ExploreUserDetailsComponent = ({
    selectedUserID,
    contacts,
}: ExploreUserDetailsComponentProps) => {
    const [activeOrganizationID, setActiveOrganizationID] = useState<string | null | false>(false);
    const { user: selectedUser, isLoading, error, reloadUser } = useUser(selectedUserID, activeOrganizationID || "");
    const [showAllContacts, setShowAllContacts] = useState(false);


  const [isUpdatingArchive, setIsUpdatingArchive] = useState(false);
  const [isArchived, setIsArchived] = useState(false);

  const [ userContacts, setUserContacts] = useState<{ContactID: string, isOwnOrganization: boolean}[] | false>(false);

  useEffect(() => {
    if(userContacts) {
      reloadUser();
    }

  }, [activeOrganizationID]);


  useEffect(() => {
    const fetchUserContacts = async () => {
        const response = await fetch(`/api/protected/security_users/${selectedUserID}/contacts`);
        const data = await response.json();
        const relatedContacts = data.relatedContacts as {ContactID: string, isOwnOrganization: boolean}[];
        setUserContacts(relatedContacts);

        let selectedContactID = relatedContacts.find(c=>c.isOwnOrganization)?.ContactID || null;
        if(selectedContactID===null) {
            selectedContactID = data.relatedContacts[0]?.ContactID || null;
        }
        setActiveOrganizationID(selectedContactID || null);
      }

    if(selectedUserID) {
        fetchUserContacts();
    }
  }, [selectedUserID]);
    
    const handleArchiveToggle = async () => {
        if (!selectedUser) return;

        setIsUpdatingArchive(true);
        try {
            const response = await fetch(`/api/protected/archive/user/${selectedUser.UserID}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ archive: !isArchived }),
            });

            if (!response.ok) {
                throw new Error('Failed to update archive status');
            }

            setIsArchived(!isArchived);
        } catch (error) {
            console.error('Error updating archive status:', error);
        } finally {
            setIsUpdatingArchive(false);
        }
    };

    const handleLoginAsUser = async () => {
        if (!selectedUser || !selectedUser.UserName) return;

        try {
            // First get the auth token
            const tokenResponse = await fetch(`/api/security/gettoken/${encodeURIComponent(selectedUser.UserID)}`);
            
            if (!tokenResponse.ok) {
                console.error("Failed to get token:");
                return;
            }

            const { token } = await tokenResponse.json() as { token: string };

            // Attempt to sign in using the token provider
            await signIn("token-login", {
                userid: selectedUser.UserID,
                token,
                redirect: true,
                callbackUrl: "/beheer"
            });
        } catch (error) {
            console.error("Error during login:", error);
        }
    };

    const renderSelectActiveOrganization = () => {
        if (!userContacts) {
            return null;
        }

        if(userContacts && userContacts.length === 0) {
            console.warn("exploreuserdetailscomponent - no user contacts found");
            return null;
        }

        if(userContacts && userContacts.length === 1) {
        // No need for selection
        return null;
        }

        return (
            <div className="mb-6 flex flex-col">
                <label htmlFor="group" className="text-2xl font-semibold mb-2 mt-4">{userContacts.length <2 ? "" : "Selecteer"} Actieve Organisatie</label>
                <select 
                    id="group" 
                    name="group" 
                    className="mt-1 p-2 border border-gray-300 rounded-md" 
                    value={activeOrganizationID||'none'}
                    onChange={(e) => {
                        let organization = null;
                        if(e.target.value !== "none") {
                            organization = userContacts.find((contact) => contact?.ContactID === e.target.value) || null;
                        }

                        setActiveOrganizationID(organization?.ContactID || null);
                    }}
                    disabled={userContacts.length < 2}
                >
                    { userContacts.map((contact) => {
                        const tmpcontact = contacts.find((c) => c.ID === contact.ContactID);
                    //   const showSelectedContact = contact?.ContactID === selectedContact?.ID && userContacts.length > 1;
                        return (<option key={tmpcontact?.ID} value={tmpcontact?.ID}>{tmpcontact?.CompanyName} {contact.isOwnOrganization ? "(eigen organisatie)" : ""}</option>);
                    })}
                    { activeOrganizationID === null && (
                        <option value="none">Geen actieve organisatie</option>
                    )}
                </select>
            </div>
        );
    }    

  if(isLoading || userContacts === false) {
    return <LoadingSpinner message="Gebruiker laden" />;
  }

  if(error) {
    return <div>Fout bij laden van gebruiker: {error}</div>;
  }

  if(!selectedUser || activeOrganizationID === false) {
    return null;
  }

  if(!selectedUser) return null;

  let linkElement: React.ReactElement | null = null;
  if(userContacts.length > 0) {
      const contactID = userContacts.find(c=>c.isOwnOrganization)?.ContactID || null;
      const tmpcontact = contacts.find((c) => c.ID === contactID);
      if(tmpcontact) {
          linkElement = <span className="text-gray-900">{tmpcontact.CompanyName}</span>;
          //linkElement = <Link href={`/beheer/${VSMenuTopic.ExploreGemeenten}/${tmpcontact.ID}`} target="_blank">{tmpcontact.CompanyName}</Link>;
      }
  //     switch(selectedContact.ItemType) {
  //         case 'admin':
  //             linkElement = <span className="text-gray-900">{selectedContact?.CompanyName} [Admin]</span>;
  //             break;
  //         case 'organizations':
  //             linkElement = <Link href={`/beheer/${VSMenuTopic.ExploreGemeenten}/${selectedContact.ID}`} target="_blank">{selectedContact.CompanyName}</Link>;
  //             break;
  //         case 'exploitant':
  //             linkElement = <Link href={`/beheer/${VSMenuTopic.ExploreExploitanten}/${selectedContact.ID}`} target="_blank">{selectedContact.CompanyName}</Link>;
  //             break;
  //         case 'dataprovider':
  //             linkElement = <span className="text-gray-900">{selectedContact?.CompanyName}</span>;
  //             break;
  //         default:
  //             linkElement = <span className="text-gray-900">{selectedContact?.CompanyName} [{selectedContact.ItemType}]</span>;
  //             break;
  //     }
   } else {
      linkElement = <span className="text-gray-900">No main contact found</span>;
   }

  const formatLastLogin = (lastLogin: Date | null) => {
      if (!lastLogin) return "Never";
      const loginDate = new Date(lastLogin);
      const dayssince = Math.floor((new Date().getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24));
      if (dayssince === 0) {
          return loginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (dayssince === 1) {
          return loginDate.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' }) + ` (yesterday)`;
      } else {
          return loginDate.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' }) + ` (${dayssince} days ago)`;
      }
  };

  const roles = Object.values(VSUserRoleValuesNew);

  return (
      <div className="p-6 bg-white shadow-md rounded-md">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Details Gebruiker</h2>
              <div className="flex gap-2">
                  {process.env.NODE_ENV === "development" && (
                      <button
                          onClick={handleLoginAsUser}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-md"
                      >
                          Inloggen als deze gebruiker
                      </button>
                  )}
                  <button
                      onClick={handleArchiveToggle}
                      disabled={isUpdatingArchive}
                      className={`${
                          isArchived 
                              ? 'bg-green-500 hover:bg-green-600' 
                              : 'bg-red-500 hover:bg-red-600'
                      } text-white px-4 py-2 rounded-md disabled:opacity-50`}
                  >
                      {isUpdatingArchive 
                          ? 'Bezig...' 
                          : isArchived 
                              ? 'Gearchiveerd' 
                              : 'Archiveren'
                      }
                  </button>
              </div>
          </div>
          <div className="space-y-2">
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Naam:</label>
                  <span className="text-gray-900">{selectedUser.DisplayName}</span>
              </div>
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Email:</label>
                  <span className="text-gray-900">{selectedUser.UserName}</span>
              </div>
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Gebruiker ID:</label>
                  <span className="text-gray-900">{selectedUser.UserID}</span>
              </div>
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Organisatie:</label>
                  { linkElement }
              </div>
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Laatste Inlog:</label>
                  <span className="text-gray-900">{formatLastLogin(selectedUser.LastLogin)}</span>
              </div>
              <div className="flex items-center">
                  <label className="w-32 text-sm font-medium text-gray-700">Organisaties:</label>
                  <div className="flex flex-wrap gap-2 text-gray-900">
                      {userContacts && userContacts.slice(0, showAllContacts ? userContacts.length : 5).map((contact) => { 
                          const tmpcontact = contacts.find((c) => c.ID === contact.ContactID);
                          if(tmpcontact) {
                              return (
                                  <div key={contact.ContactID} className={`bg-blue-100 text-blue-800 px-2 py-1 rounded-md`}>
                                      <Link href={`/beheer/${VSMenuTopic.ExploreGemeenten}/${contact.ContactID}`} target="_blank">{tmpcontact.CompanyName}</Link>
                                  </div>
                              );
                          }
                      })}
                      {userContacts && userContacts.length > 5 && (
                          <button onClick={() => setShowAllContacts(!showAllContacts)} className="mt-2 text-blue-500">
                              {showAllContacts ? 'Toon Minder' : 'Toon Meer'}
                          </button>
                      )}
                  </div>
              </div>
              <div className="flex items-center">
                  {renderSelectActiveOrganization()}
              </div>
              <ExploreUserSecurityProfileComponent selectedUser={selectedUser} />
          </div>
      </div>
  );
}; 