import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import { VSUserSecurityProfile, VSMenuTopic } from "~/types/index";
import { VSContactDataprovider, VSContactGemeente, VSContactExploitant } from "~/types/contacts";
import { VSUserWithRolesNew, VSUserRole, VSUserGroupValues } from "~/types/users";
import { getNewRoleLabel, getOldRoleLabel } from "~/types/utils";
import LeftMenuFietsberaad from "./beheer/LeftMenuFietsberaad";
import { convertRoleToNewRole } from "~/utils/securitycontext";

interface ExploreLeftMenuComponentProps {
    users: VSUserWithRolesNew[]
    roles: VSUserRole[]
    gemeenten: VSContactGemeente[]
    exploitanten: VSContactExploitant[]
    dataproviders: VSContactDataprovider[]
}

// returns an array of user IDs for users that have a mismatch between GroupID in security_users and GroupID in security_roles together with the reason
const ExploreLeftMenuComponent = (props: ExploreLeftMenuComponentProps) => {   
    const router = useRouter();

    const queryUserID = Array.isArray(router.query.userID) ? router.query.userID[0] : router.query.userID;

    const { roles, users, gemeenten, exploitanten, dataproviders } = props;
    const [filteredUsers, setFilteredUsers] = useState<VSUserWithRolesNew[]>(users);
    const [selectedUserID, setSelectedUserID] = useState<string | null>(queryUserID || null);

    const [emailFilter, setEmailFilter] = useState<string>("");
    const [roleFilter, setRoleFilter] = useState<number | undefined>(undefined);
    const [contactFilter, setContactFilter] = useState<"Yes" | "No">("No");
    const [gemeenteFilter, setGemeenteFilter] = useState<string>("");
    const [exploitantFilter, setExploitantFilter] = useState<string>("");
    const [invalidDataFilter, setInvalidDataFilter] = useState<"Yes" | "No" | "Only">("No");
    const [inactiveUserFilter, setInactiveUserFilter] = useState<"Yes" | "No" | "Only">("Yes");

    const [activeOrganization, setActiveOrganization] = useState<VSContactGemeente | VSContactExploitant | null>(null);
    const [showAllContacts, setShowAllContacts] = useState(false);
    const [showAllAccessRights, setShowAllAccessRights] = useState(false);

    const [securityProfile, setSecurityProfile] = useState<VSUserSecurityProfile | undefined>(undefined);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const selectedUser = users.find(user => user.UserID === selectedUserID);

    // reset the active user if any of the filters change and the active user is not in the filtered users
    useEffect(() => {
        if(selectedUserID && !filteredUsers.some((user) => user.UserID === selectedUserID)) {
            setSelectedUserID(null);
        }
    }, [emailFilter, roleFilter, contactFilter, gemeenteFilter, exploitantFilter, invalidDataFilter, inactiveUserFilter, filteredUsers]);

    useEffect(() => {
        if(securityProfile) {
            const mainContact = gemeenten.find((gemeente) => gemeente.ID === securityProfile.mainContactId) || exploitanten.find((exploitant) => exploitant.ID === securityProfile.mainContactId);
            setActiveOrganization(mainContact || null);
        } else {
            setActiveOrganization(null);
        }
    }, [securityProfile?.mainContactId]);

    useEffect(() => {
        const currentUserID = router.query.userID;
        if (currentUserID && currentUserID !== selectedUserID) {
                setSelectedUserID(currentUserID as string);
            }
    }, [router.query.userID]);

    useEffect(() => {
        if(router.query.userID !== selectedUserID) {
            if(selectedUserID) {
            router.push({
                pathname: router.pathname,
                    query: { ...router.query, userID: selectedUserID }
                });
            }
        } else {
            // delete userID from router query
            const { userID, ...rest } = router.query;
            router.push({
                pathname: router.pathname,
                query: rest
            });
        }
    }, [selectedUserID]);


    useEffect(() => {
        const filteredUsers = users
            .filter((user) => (
                emailFilter === "" || 
                user.UserName?.toLowerCase().includes(emailFilter.toLowerCase()) || 
                user.DisplayName?.toLowerCase().includes(emailFilter.toLowerCase())
            ))
            .filter((user) => (roleFilter === undefined || user.RoleID === roleFilter))
            .filter((user) => (
                gemeenteFilter === "" || 
                user.security_users_sites.some((site) => site.SiteID === gemeenteFilter)
            ))
            .filter((user) => {
                if (exploitantFilter === "") return true;

                if (user.GroupID !== 'exploitant') return false;

                // console.debug("check user " + user.DisplayName + " with exploitantFilter " + exploitantFilter + " and user.GroupID " + user.GroupID);

                // Check if the user is a main user with the exploitantID
                if (user.SiteID === exploitantFilter) {
                    console.debug("  == 1. " + user.DisplayName + " is main user for " + exploitantFilter);
                    return true;
                }

                // Check if the user is a subuser and the main user links to the exploitantID
                const mainUser = users.find(main => main.UserID === user.ParentID);
                if(mainUser?.SiteID === exploitantFilter) {
                    console.debug("  == 2. " + user.DisplayName + " is sub user for " + exploitantFilter);
                    return true;
                }

                console.debug("  == 3. " + user.DisplayName + " is not a main or sub user for " + exploitantFilter);
                return false;
            })

        console.debug("set filteredUsers: " + filteredUsers.length);
        setFilteredUsers(filteredUsers);
    }, [emailFilter, roleFilter, contactFilter, gemeenteFilter, exploitantFilter, invalidDataFilter, inactiveUserFilter]);

    useEffect(() => {
        async function loadSecurityProfile() {
            if (!selectedUser) {
                return;
            }

            setIsLoadingProfile(true);
            setProfileError(null);

            try {
                const profile = await fetchSecurityProfile(
                    selectedUser.UserID, 
                    activeOrganization?.ID || ""
                );

                setSecurityProfile(profile);
            } catch (error) {
                console.error('Error fetching security profile:', error);
                setProfileError(error instanceof Error ? error.message : 'Failed to fetch security profile');
                setSecurityProfile(undefined);
            } finally {
                setIsLoadingProfile(false);
            }
        }

        loadSecurityProfile();
    }, [selectedUser?.UserID, activeOrganization?.ID]);

    const filterEmailHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setEmailFilter(event.target.value);
    }

    const selectUserHandler = (userID: string) => {
        setSelectedUserID(userID);
    }

    const resetFilters = () => {
        setEmailFilter("");
        setRoleFilter(undefined);
        setContactFilter("No");
        setGemeenteFilter("");
        setExploitantFilter("");
        setInvalidDataFilter("Yes");
        setInactiveUserFilter("No");
    };

    const checkAssumptions = () => {
        let assumptionsfailed = false;
        const userlabel = (user: VSUserWithRolesNew) => {
            return `${user.DisplayName} [${user.UserName}/${user.UserID}]`;
        }
        switch(selectedUser?.GroupID) {
            case 'intern':
                break;
            case 'extern':
                // check that there are no users in this group that have more than one linked contact via security_users_sites
                const externUsers = users.filter((user) => user.GroupID === 'extern');
                const externUsersWithMultipleContacts = externUsers.filter((user) => user.security_users_sites.length > 1);
                if(externUsersWithMultipleContacts.length > 0) {
                    console.error(`There are users in the extern group that have more than one linked contact via security_users_sites: ${externUsersWithMultipleContacts.map(userlabel).join(", ")}`);
                    assumptionsfailed = true;
                }

                // check that for users in this group that if the siteid is set, the same siteid is also in the security_users_sites array
                const externUsersWithSiteID = externUsers.filter((user) => user.SiteID !== null);
                const externUsersWithSiteIDNotInSecurityUsersSites = externUsersWithSiteID.filter((user) => !user.security_users_sites.some((site) => site.SiteID === user.SiteID));
                if(externUsersWithSiteIDNotInSecurityUsersSites.length > 0) {
                    console.error(`There are users in the extern group that have a siteid set, but the same siteid is not in the security_users_sites array: ${externUsersWithSiteIDNotInSecurityUsersSites.map(userlabel).join(", ")}`);
                    assumptionsfailed = true;
                }

                break;
            case 'exploitant':
                const exploitantUsers = users
                    .filter((user) => user.GroupID === 'exploitant')
                    .filter((user) => user.UserID !== "F2390AFC-72D7-40A3-8C910F8C4B055938"); // known bad: no siteid and no parentid
                // assume that users in this group either have: 
                // a site id and no sites linked via a parentid related user
                exploitantUsers.forEach((user) => {
                    if(user.SiteID !== null) {
                        if(user.ParentID !== null) {
                            console.error(`User ${userlabel(user)} has a siteid and a parentid`);
                            assumptionsfailed = true;
                        }
                    }
                });
                // no site id and one site linked via a parentid related user
                exploitantUsers.forEach((user) => {
                    if(user.SiteID === null) {
                        if(user.ParentID === null) {
                            console.error(`User ${userlabel(user)} has no siteid and no parentid`);
                            assumptionsfailed = true;
                        }
                    }
                });

                break;
            case 'dataprovider':
                break;
            default:
                break;
        }

        if(assumptionsfailed) {
            console.error("One or more assumptions failed");
        }
    }

    const renderFilterSection = () => {
        return (
            <div className="p-6 bg-white shadow-md rounded-md">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold">Test Hoofdmenu</h1>
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
                        <label htmlFor="gemeente" className="text-sm font-medium text-gray-700">Selecteer Gemeente:</label>
                        <select 
                            id="gemeente" 
                            name="gemeente" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={gemeenteFilter}
                            onChange={(e) => setGemeenteFilter(e.target.value)}
                        >
                            <option value="">Alle gemeenten</option>
                            {gemeenten.map((gemeente) => (
                                <option value={gemeente.ID} key={gemeente.ID}>{gemeente.CompanyName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="exploitant" className="text-sm font-medium text-gray-700">Selecteer Exploitant:</label>
                        <select 
                            id="exploitant" 
                            name="exploitant" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={exploitantFilter}
                            onChange={(e) => setExploitantFilter(e.target.value)}
                        >
                            <option value="">Alle exploitanten</option>
                            {exploitanten.map((exploitant) => (
                                <option value={exploitant.ID} key={exploitant.ID}>{exploitant.CompanyName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="role" className="text-sm font-medium text-gray-700">Selecteer Rol (nieuw / oud):</label>
                        <select 
                            id="role" 
                            name="role" 
                            className="mt-1 p-2 border border-gray-300 rounded-md" 
                            value={roleFilter ?? ""}
                            onChange={(e) => setRoleFilter(Number(e.target.value) || undefined)}
                        >
                            <option value="">Alle Rollen</option>
                            {roles.map((role) => (
                                <option value={role.RoleID} key={role.RoleID}>{getNewRoleLabel(convertRoleToNewRole(role.RoleID, true))} / {getOldRoleLabel(role.RoleID)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold mt-6">Gebruikerslijst</h2>
                        <ul className="list-disc list-inside max-h-fit overflow-y-auto">
                            {filteredUsers.map((user) => (
                                <li 
                                    key={user.UserID} 
                                    className={`cursor-pointer p-2 ${selectedUserID === user.UserID ? 'bg-blue-100' : ''}`} 
                                    onClick={() => selectUserHandler(user.UserID)}
                                >
                                    {`${user.DisplayName} [${getNewRoleLabel(convertRoleToNewRole(user.RoleID, true))} / ${(user.RoleID && getOldRoleLabel(user.RoleID))||"---"}]`}
                                </li>
                            ))}
                        </ul>
                    </div>
                </form>
            </div>
        );
    }

    const renderUserDetailsSection = (mainContact: VSContactGemeente | VSContactExploitant | undefined | null, managedContacts: (VSContactGemeente | VSContactExploitant)[]) => {
        if(!selectedUser) return null;

        let linkElement: React.ReactElement | null = null;
        if(mainContact) {
            switch(mainContact.ItemType) {
                case 'admin':
                    linkElement = <span className="text-gray-900">{mainContact?.CompanyName} [Admin]</span>;
                    break;
                case 'organizations':
                    linkElement = <Link href={`/beheer/${VSMenuTopic.ExploreGemeenten}/${mainContact.ID}`} target="_blank">{mainContact.CompanyName}</Link>;
                    break;
                case 'exploitant':
                    linkElement = <Link href={`/beheer/${VSMenuTopic.ExploreExploitanten}/${mainContact.ID}`} target="_blank">{mainContact.CompanyName}</Link>;
                    break;
                case 'dataprovider':
                    linkElement = <span className="text-gray-900">{mainContact?.CompanyName}</span>;
                    break;
                default:
                    linkElement = <span className="text-gray-900">{mainContact?.CompanyName} [{mainContact.ItemType}]</span>;
                    break;
            }
        } else {
            linkElement = <span className="text-gray-900">No main contact found</span>;
        }

        return (
            <div className="p-6 bg-white shadow-md rounded-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Details Gebruiker</h2>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Naam:</label>
                        <span className="text-gray-900">{selectedUser.DisplayName}</span>
                    </div>
                    {/* <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Email:</label>
                        <span className="text-gray-900">{selectedUser.UserName}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Gebruiker ID:</label>
                        <span className="text-gray-900">{selectedUser.UserID}</span>
                    </div> */}
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Organisatie:</label>
                        { linkElement }
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rol:</label>
                        <span className="text-gray-900">{getNewRoleLabel(convertRoleToNewRole(selectedUser.RoleID, true))}</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rol (oud):</label>
                        <span className="text-gray-900">{(selectedUser.RoleID && getOldRoleLabel(selectedUser.RoleID))||"---"}</span>
                    </div>
                    {/* <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Groep:</label>
                        { selectedUser?.GroupID === 'exploitant' ? (
                            <span className="text-gray-900">{selectedUser.GroupID} ({selectedUser.ParentID===null ? "Hoofdgebruiker" : "Subgebruiker"})</span>
                        ) : (
                            <span className="text-gray-900">{selectedUser.GroupID}</span>
                        )}
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rol ID:</label>
                        <span className="text-gray-900">{roles.find(role => role.RoleID === selectedUser.RoleID)?.Role} [{selectedUser.RoleID}]</span>
                    </div>
                    <div className="flex items-center">
                        <label className="w-32 text-sm font-medium text-gray-700">Rollen:</label>
                        <span className="text-gray-900">{roles.find(role => role.RoleID === selectedUser.RoleID)?.Role}</span>
                    </div> */}
                </div>
            </div>
        );
    }

    const renderSelectActiveOrganization = (
        mainContact: VSContactGemeente | VSContactExploitant | undefined | null, 
        managedContacts: (VSContactGemeente | VSContactExploitant | undefined | null)[]) => {
        if (!selectedUser) return null;

        if(managedContacts.length === 0) {
            return null;
        }

        return (
            <div className="mb-6 flex flex-col">
                <label htmlFor="group" className="text-2xl font-semibold mb-2 mt-4">{managedContacts.length <2 ? "" : "Selecteer"} Actieve Organisatie</label>
                <select 
                    id="group" 
                    name="group" 
                    className="mt-1 p-2 border border-gray-300 rounded-md" 
                    value={activeOrganization?.ID||'none'}
                    onChange={(e) => {
                        let organization = null;
                        if(e.target.value !== "none") {
                            if(e.target.value === mainContact?.ID) {
                                organization = mainContact;
                            } else {
                                organization = managedContacts.find((contact) => contact?.ID === e.target.value) || null;
                            }
                        }

                        setActiveOrganization(organization || null);
                    }}
                    disabled={managedContacts.length < 2}
                >
                    { managedContacts.map((contact) => {
                        const showMainContact = contact?.ID === mainContact?.ID && managedContacts.length > 1;
                        return (<option key={contact?.ID} value={contact?.ID}>{contact?.CompanyName} {showMainContact ? "(eigen organisatie)" : ""}</option>);
                    })}
                    { activeOrganization === null && (
                        <option value="none">Geen actieve organisatie</option>
                    )}
                </select>
            </div>
        );
    }    

    checkAssumptions();

    let mainContact: VSContactGemeente | VSContactExploitant | undefined | null = undefined;
    let managedContacts: (VSContactGemeente | VSContactExploitant)[] = [];
    if(securityProfile) {
        mainContact = gemeenten.find((gemeente) => gemeente.ID === securityProfile.mainContactId) || exploitanten.find((exploitant) => exploitant.ID === securityProfile.mainContactId);

        const managedGemeenten = securityProfile.managingContactIDs.map((contactID) => gemeenten.find((gemeente) => gemeente.ID === contactID)).filter((gemeente) => gemeente !== undefined);
        const managedExploitanten = securityProfile.managingContactIDs.map((contactID) => exploitanten.find((exploitant) => exploitant.ID === contactID)).filter((exploitant) => exploitant !== undefined);
        managedContacts = [...managedGemeenten, ...managedExploitanten];
    } else {
        if(isLoadingProfile) {
            return 
        }

        if(selectedUser) {
            console.error("No security profile found for user", selectedUser?.UserID);
        }
    }

    return (
        <div className="w-3/4 mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                {renderFilterSection()}
            </div>
            { !isLoadingProfile ? 
                <div>
                    { renderUserDetailsSection(mainContact, managedContacts) }
                    <div className="px-2 bg-white shadow-md rounded-md">
                        <div className="px-4 flex justify-between items-center mt-4">
                            <h2 className="text-2xl font-bold">Hoofdmenu</h2>
                        </div>
                        <LeftMenuFietsberaad securityProfile={securityProfile} activecontact={activeOrganization || undefined} activecomponent={undefined} onSelect={() => {}}/>
                    </div>
                </div> : 
                <div className="p-6 flex flex-col text-center justify-center">
                    <span className="text-gray-600 mt-12">Beveiligingsprofiel wordt geladen voor {selectedUser?.DisplayName}</span>
                </div> 
            }
        </div>
    );
}

async function fetchSecurityProfile(userId: string, activeContactId: string) {
    let url = `/api/security/profile/${userId}`;
    if (activeContactId) {
        url += `/${activeContactId}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch security profile');
    }

    const data = await response.json();
    return data.profile as VSUserSecurityProfile;
}

export default ExploreLeftMenuComponent;