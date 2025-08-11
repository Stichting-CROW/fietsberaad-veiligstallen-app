"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { VSUserRoleValuesNew, type VSUserWithRolesNew } from "~/types/users";
import { useAllUsers } from "~/hooks/useAllUsers";
import { useGemeentenInLijst } from "~/hooks/useGemeenten";
import { useExploitanten } from "~/hooks/useExploitanten";
import { LoadingSpinner } from "./beheer/common/LoadingSpinner";
import { ExploreUserDetailsComponent } from "./ExploreUserDetailsComponent";
import { getNewRoleLabel } from "~/types/utils";

const ExploreUsersComponent = () => {  
    const router = useRouter();

    const queryUserID = Array.isArray(router.query.userID) ? router.query.userID[0] : router.query.userID;

    const { users, isLoading: isLoadingUsers, error: errorUsers } = useAllUsers();

    const { gemeenten, isLoading: isLoadingGemeenten, error: errorGemeenten } = useGemeentenInLijst();
    const { exploitanten, isLoading: isLoadingExploitanten, error: errorExploitanten } = useExploitanten(undefined);

    const [archivedUserIds, setArchivedUserIds] = useState<string[]>([]);
    const [archivedFilter, setArchivedFilter] = useState<"Yes" | "No" | "Only">("No");


    const [filteredUsers, setFilteredUsers] = useState<VSUserWithRolesNew[]>(users);
    const [selectedUserID, setSelectedUserID] = useState<string | null>(queryUserID || null);

    const [emailFilter, setEmailFilter] = useState<string>("");
    const [contactFilter, setContactFilter] = useState<"Yes" | "No">("No");
    const [organisatieFilter, setOrganisatieFilter] = useState<string>("all-organizations");
    const [invalidDataFilter, setInvalidDataFilter] = useState<"Yes" | "No" | "Only">("No");

    const [isArchived, setIsArchived] = useState<boolean>(false);
    const [isUpdatingArchive, setIsUpdatingArchive] = useState<boolean>(false);

    const [showInactiveDays, setShowInactiveDays] = useState<number | undefined>(undefined);

    const selectedUser = users.find(user => user.UserID === selectedUserID);

    // reset the active user if any of the filters change and the active user is not in the filtered users
    useEffect(() => {
        if(selectedUserID && !filteredUsers.some((user) => user.UserID === selectedUserID)) {
            setSelectedUserID(null);
        }
    }, [emailFilter, contactFilter, organisatieFilter, invalidDataFilter, filteredUsers]);

    useEffect(() => {
        const currentUserID = router.query.userID;
        if (currentUserID && currentUserID !== selectedUserID) {
                setSelectedUserID(currentUserID as string);
            }
    }, []);

    useEffect(() => {
        if(router.query.userID !== selectedUserID) {
            if(selectedUserID) {
            router.push({
                pathname: router.pathname,
                    query: { ...router.query, userID: selectedUserID }
                }).catch(err => {
                    console.error("Error pushing router", err);
                });
            }
        } else if (selectedUserID === null)  {
            // delete userID from router query
            const newQuery = { ...router.query };
            delete newQuery.userID;
            router.push({
                pathname: router.pathname,
                query: newQuery
            }).catch(err => {
                console.error("Error pushing router", err);
            });
        }
    }, [selectedUserID, router]);

    useEffect(() => {
        const filteredUsers = users
            .filter((user) => (
                emailFilter === "" || 
                user.UserName?.toLowerCase().includes(emailFilter.toLowerCase()) || 
                user.DisplayName?.toLowerCase().includes(emailFilter.toLowerCase())
            ))
            .filter((user) => {
                if(contactFilter === "Yes") return user.isContact;
                return !user.isContact;
            })
            .filter((user) => {
                const isArchived = archivedUserIds.includes(user.UserID);
                if (archivedFilter === "Yes") {
                    return true;
                } else if (archivedFilter === "Only") {
                    return isArchived;
                } else {
                    return !isArchived;
                }
            })
            .filter((user) => {
                if(organisatieFilter === "all-organizations") return true;
                return user.ownOrganizationID === organisatieFilter;
            })
            .filter((user) => {
                if (showInactiveDays === undefined) return true;
                
                if (!user.LastLogin) return true; // Show users who never logged in
                
                const lastLoginDate = new Date(user.LastLogin);
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - showInactiveDays);
                
                return lastLoginDate < cutoffDate; // Show users who haven't logged in since cutoff date
            });

        setFilteredUsers(filteredUsers);
    }, [users, emailFilter, contactFilter, organisatieFilter, invalidDataFilter, archivedFilter, archivedUserIds, showInactiveDays]);


    useEffect(() => {
        if (selectedUser) {
            // Fetch archive status when user is selected
            const fetchArchiveStatus = async () => {
                try {
                    const response = await fetch(`/api/protected/archive/user/status/${selectedUser.UserID}`);
                    if (response.ok) {
                        const data = await response.json() as { archived: boolean };
                        setIsArchived(data.archived);
                    }
                } catch (error) {
                    console.error('Error fetching archive status:', error);
                }
            };
            fetchArchiveStatus().catch(err => {
                console.error("Error fetching archive status", err);
            });
        }
    }, [selectedUser]);

    useEffect(() => {
        const fetchArchivedUsers = async () => {
            try {
                const response = await fetch('/api/protected/archive/user/list');
                if (response.ok) {
                    const data = await response.json();
                    setArchivedUserIds(data.archivedUserIds);
                }
            } catch (error) {
                console.error('Error fetching archived users:', error);
            }
        };
        fetchArchivedUsers();
    }, [isArchived]);

    const handleArchiveToggle = async () => {
        if (!selectedUser) return;
        
        setIsUpdatingArchive(true);
        try {
            const response = await fetch('/api/protected/archive/user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: selectedUser.UserID,
                    archived: !isArchived
                })
            });

            if (response.ok) {
                setIsArchived(!isArchived);
            } else {
                console.error('Failed to update archive status');
            }
        } catch (error) {
            console.error('Error updating archive status:', error);
        } finally {
            setIsUpdatingArchive(false);
        }
    };

    const filterEmailHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setEmailFilter(event.target.value);
    }

    const selectUserHandler = (userID: string) => {
        setSelectedUserID(userID);
    }

    const resetFilters = () => {
        setEmailFilter("");
        setContactFilter("No");
        setOrganisatieFilter("");
        setInvalidDataFilter("Yes");
        setArchivedFilter("No");
        setShowInactiveDays(undefined);
    };

    const exportToCSV = () => {
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') + '-' +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0');
        
        const filename = `${timestamp}-selected-users.csv`;
        
        // Create CSV content
        const csvContent = [
            'ID,DisplayName,UserName',
            ...filteredUsers.map(user => `${user.UserID},"${user.DisplayName || ''}","${user.UserName || ''}"`)
        ].join('\n');
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderFilterSection = (contacts: {ID: string, CompanyName: string}[]) => {
        const roles= Object.values(VSUserRoleValuesNew);

        return (
            <div className="p-6 bg-white shadow-md rounded-md">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold">Filter Gebruikers</h1>
                    <button 
                        className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
                        onClick={resetFilters}
                    >
                        Reset Filters
                    </button>
                </div>
                <form className="space-y-4">
                    <div className="flex flex-col">
                        <label htmlFor="userEmail" className="text-sm font-medium text-gray-700">Naam of Email:</label>
                        <input 
                            type="text" 
                            id="userEmail" 
                            name="userEmail" 
                            placeholder="Type om te zoeken..." 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={emailFilter}
                            onChange={filterEmailHandler} 
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="contact" className="text-sm font-medium text-gray-700">Alleen contactpersonen weergeven:</label>
                        <select 
                            id="contact" 
                            name="contact" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={contactFilter}
                            onChange={(e) => setContactFilter(e.target.value === "Yes" ? "Yes" : "No")}
                        >
                            <option value="Yes">Ja</option>
                            <option value="No">Nee</option>
                        </select>                        
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="organisatie" className="text-sm font-medium text-gray-700">Selecteer Organisatie:</label>
                        <select 
                            id="organisatie" 
                            name="organisatie" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={organisatieFilter}
                            onChange={(e) => setOrganisatieFilter(e.target.value)}
                        >
                            <option value="all-organizations">Alle organisaties</option>
                            <option value="">Geen organisatie</option>
                            {contacts.map((contact) => (
                                <option value={contact.ID} key={contact.ID}>{contact.CompanyName}</option>
                            ))}
                        </select>
                    </div>
                    {/* <div className="flex flex-col">
                        <label htmlFor="invalidData" className="text-sm font-medium text-gray-700">Gebruikers met ongeldige data:</label>
                        <select 
                            id="invalidData" 
                            name="invalidData" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={invalidDataFilter}
                            onChange={(e) => setInvalidDataFilter(e.target.value as "Yes" | "No" | "Only")}
                        >
                            <option value="Yes">Ja</option>
                            <option value="No">Nee</option>
                            <option value="Only">Alleen</option>
                        </select>                        
                    </div> */}
                   <div className="flex flex-col">
                        <label htmlFor="archivedUsers" className="text-sm font-medium text-gray-700">Toon gearchiveerde gebruikers:</label>
                        <select 
                            id="archivedUsers" 
                            name="archivedUsers" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={archivedFilter}
                            onChange={(e) => setArchivedFilter(e.target.value as "Yes" | "No" | "Only")}
                        >
                            <option value="Yes">Ja</option>
                            <option value="No">Nee</option>
                            <option value="Only">Alleen</option>
                        </select>                        
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="showInactive" className="text-sm font-medium text-gray-700">Toon gebruikers die de laatste X niet zijn ingelogd:</label>
                        <select 
                            id="showInactive" 
                            name="showInactive" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={showInactiveDays || ""}
                            onChange={(e) => setShowInactiveDays(e.target.value ? Number(e.target.value) : undefined)}
                        >
                            <option value="">Geen filter</option>
                            <option value="30">30 dagen</option>
                            <option value="90">90 dagen</option>
                            <option value="180">180 dagen</option>
                            <option value="365">1 jaar</option>
                        </select>                        
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold mt-6">Gebruikerslijst</h2>
                            <button 
                                type="button"
                                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                                onClick={exportToCSV}
                            >
                                Export
                            </button>
                        </div>
                        <ul className="list-disc list-inside max-h-fit overflow-y-auto">
                            {filteredUsers.map((user) => { 
                                const organizationName: string = contacts.find(contact => contact.ID === user.ownOrganizationID)?.CompanyName || "Onbekende organisatie";
                                
                                return (
                                <li 
                                    key={user.UserID} 
                                    className={`cursor-pointer p-2 ${selectedUserID === user.UserID ? 'bg-blue-100' : ''}`} 
                                    onClick={() => selectUserHandler(user.UserID)}
                                >
                                    {`${user.DisplayName} [${user.UserName}/${organizationName}]`}
                                </li>
                            )})}
                        </ul>
                    </div>
                </form>
            </div>
        );
    }

    // checkAssumptions();

    if(isLoadingUsers || isLoadingExploitanten || isLoadingGemeenten) {
        const whatIsLoading = [
            isLoadingUsers && "Gebruikers",
            isLoadingExploitanten && "Exploitanten",
            isLoadingGemeenten && "Gemeenten",
        ].filter(Boolean).join(" + ");
        return <LoadingSpinner message={whatIsLoading + ' laden'} />;
    }

    if(errorUsers || errorExploitanten || errorGemeenten ) {
        return <div>Error: {errorUsers || errorExploitanten || errorGemeenten  }</div>;
    }

    const contacts = [
        {ID: "1", CompanyName: "** Fietsberaad"},
            ...gemeenten
                .map((gemeente) => ({ID: gemeente.ID, CompanyName: gemeente.CompanyName || "Gemeente " + gemeente.ID}))
                .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName)), 
            ...exploitanten
                .map((exploitant) => ({ID: exploitant.ID, CompanyName: "**" + exploitant.CompanyName || "Exploitant " + exploitant.ID}))
                .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName))
    ];

    return (
        <div className="w-3/4 mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                {renderFilterSection(contacts)}
            </div>
            <div>
                { selectedUser && <ExploreUserDetailsComponent
                    selectedUserID={selectedUser.UserID}
                    contacts={contacts}
                /> }
            </div>
        </div>
    );
}

export default ExploreUsersComponent;